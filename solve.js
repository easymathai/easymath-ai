export default async function handler(req, res) {
  const { question } = req.body;

  let answer = "Demo answer";

  if (question === "25+65") {
    answer = "25 + 65 = 90";
  } else if (question === "2x+5=17") {
    answer = "x = 6";
  } else {
    answer = "EasyMath AI is working. Full AI solver coming soon.";
  }

  res.status(200).json({ answer });
}