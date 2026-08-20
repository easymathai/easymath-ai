import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body.question;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Please enter a math question." },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: `
You are EasyMath AI, a friendly mathematics tutor.

Solve the student's math problem accurately.

Always:
1. Give the final answer clearly.
2. Explain the solution step by step.
3. Use simple language suitable for students.
4. Show calculations clearly.
5. Keep the explanation focused and easy to understand.
      `,
      input: question,
    });

    return NextResponse.json({
      solution: response.output_text,
    });
  } catch (error) {
    console.error("EasyMath AI API error:", error);

    return NextResponse.json(
      { error: "Unable to solve the question right now." },
      { status: 500 }
    );
  }
}