export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    status: 'healthy',
    paddleocr: 'api_ready',
    paddleocr_model: process.env.PADDLE_OCR_MODEL || 'PaddleOCR-VL-1.6',
    paddleocr_endpoint: process.env.PADDLE_OCR_JOB_URL || 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs',
    qwen_vl: 'ready',
    handwriting_preprocessor: 'active',
    dataset_size: 70,
    timestamp: Date.now()
  });
}
