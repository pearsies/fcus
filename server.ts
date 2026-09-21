import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Route 1: Generate Questions using gemini-3.1-flash-lite
  app.post('/api/generate-questions', async (req, res) => {
    try {
      const { topic, difficulty, materialText, count = 3 } = req.body;
      if (!topic && !materialText) {
        return res.status(400).json({ error: 'Topic or material content is required.' });
      }

      const ai = getAiClient();
      const prompt = `Generate ${count} learning practice questions for the following requirements:
Topic / Subject: ${topic || 'Custom Study Material'}
Difficulty Level: ${difficulty || 'Intermediate'}
Study Material / Context: ${materialText || 'None provided'}

Provide a mix of multiple choice questions and short open-ended conceptual questions to test understanding.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction: 'You are an educational tutor creating practice questions for active recall learning.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, description: "'multiple_choice' or 'open_ended'" },
                questionText: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Array of 4 options if type is multiple_choice'
                },
                correctAnswer: { type: Type.STRING, description: 'Correct option text or key criteria' },
                explanation: { type: Type.STRING }
              },
              required: ['id', 'type', 'questionText', 'correctAnswer', 'explanation']
            }
          }
        }
      });

      const questions = JSON.parse(response.text || '[]');
      res.json({ questions });
    } catch (err: any) {
      console.error('Error generating questions:', err);
      res.status(500).json({ error: err.message || 'Failed to generate questions' });
    }
  });

  // Route 2: Grade Answer using gemini-3.1-flash-lite
  app.post('/api/grade-answer', async (req, res) => {
    try {
      const { questionText, userAnswer, correctAnswer, questionType } = req.body;
      if (!userAnswer) {
        return res.status(400).json({ error: 'User answer is required.' });
      }

      const ai = getAiClient();
      const prompt = `Evaluate the user's answer for the following question:
Question: ${questionText}
Expected Answer / Criteria: ${correctAnswer}
User's Answer: ${userAnswer}
Question Type: ${questionType}

Determine if the user's answer is correct or demonstrates sufficient conceptual understanding. Provide concise feedback.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction: 'You are a fair, precise academic evaluator.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCorrect: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING }
            },
            required: ['isCorrect', 'feedback']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      res.json(result);
    } catch (err: any) {
      console.error('Error grading answer:', err);
      res.status(500).json({ error: err.message || 'Failed to grade answer' });
    }
  });

  // Route 3: Evaluate Work Description using gemini-3.1-flash-lite
  app.post('/api/evaluate-work', async (req, res) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== 'string' || description.trim().length < 5) {
        return res.status(400).json({ error: 'Please describe what you worked on in more detail.' });
      }

      const ai = getAiClient();
      const prompt = `Analyze this description of offline/manual work or study completed by a user:
"${description}"

Evaluate if this represents genuine productive work, study, reading, coding, or chore.
If valid, estimate a reasonable focus duration in minutes (between 10 and 240 minutes) based on the scope described. If vague or invalid, set minutes to 0 and provide constructive guidance.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction: 'You evaluate productive work logging for a focus timer application.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              minutes: { type: Type.INTEGER, description: 'Estimated productive focus minutes, or 0 if invalid' },
              activitySummary: { type: Type.STRING },
              feedback: { type: Type.STRING }
            },
            required: ['minutes', 'activitySummary', 'feedback']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      res.json(result);
    } catch (err: any) {
      console.error('Error evaluating work:', err);
      res.status(500).json({ error: err.message || 'Failed to evaluate work' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
