import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync("/home/z/my-project/upload/Screenshot 2026-06-10 095653.png");
  const base64Image = imageBuffer.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this login page screenshot with EXTREME detail. Answer each question:

1. TOP: Is there a browser tab bar at the top? What is at the very top edge?
2. LEFT SIDE: Exact colors, gradient, shapes, illustrations, decorative elements?
3. RIGHT SIDE: Background color? Every form element - fields, buttons, links, text (exact words)?
4. Is there a "Sign in with Google" button? YES or NO?
5. Main sign-in button: exact text and color?
6. BOTTOM: Any dark tab bar? What does it contain?
7. Heading text on right side - exact words?
8. Any logos visible?
9. Layout structure?
10. Placeholder text in inputs?

Only describe what you ACTUALLY see. Do not guess.`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

analyzeImage().catch(console.error);
