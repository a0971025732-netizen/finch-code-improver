export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  res.status(200).json({ status: "ok" });
}
