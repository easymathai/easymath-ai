export default async function handler(req, res) {
  const { question } = req.body;

  let answer = "EasyMath AI is working. Full AI solver coming soon.";

  if (question === "25+65") {
    answer = "25 + 65 = 90";
  }

  if (question === "2x+5=17") {
    answer = "x = 6";
  }

  res.status(200).json({ answer });
}
