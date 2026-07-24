import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const imgB64 = fs.readFileSync('/tmp/dash-b64.txt', 'utf-8').trim();
  const zai = await ZAI.create();

  const messages = [
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Output only plain text, no markdown.' }]
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this business dashboard UI in extreme detail. I need: 1) Exact sidebar nav items and their icons 2) Header/top bar content 3) Main content area - all cards, stats, charts, quick actions 4) Color scheme 5) Layout structure 6) Any logos or branding' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imgB64}` } }
      ]
    }
  ];

  const response = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages,
    thinking: { type: 'disabled' }
  });

  console.log(response.choices?.[0]?.message?.content || JSON.stringify(response));
}

main().catch(e => { console.error('Error:', e.message || e); process.exit(1); });
