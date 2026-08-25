import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No image uploaded." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Solve this math problem from the uploaded image. Explain every step clearly like a teacher. At the end include WHY IT WORKS, COMMON MISTAKE, and one PRACTICE QUESTION.",
            },
            {
              type: "input_image",
              image_url: `data:${file.type};base64,${base64}`,
              detail: "auto",
            },
          ],
        },
      ],
    });

    return NextResponse.json({
      solution: response.output_text,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to read image." },
      { status: 500 }
    );
  }
}