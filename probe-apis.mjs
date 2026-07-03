import axios from 'axios';

const agnesKey = process.env.AGNES_API_KEY;
const minimaxKey = process.env.MINIMAX_API_KEY;

async function probe(name, req) {
  try {
    const r = await req();
    console.log(`## ${name}`);
    console.log(`status=${r.status} type=${r.headers['content-type'] || ''}`);
    const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    console.log(data.slice(0, 800));
  } catch (e) {
    console.log(`## ${name}`);
    if (e.response) {
      console.log(`status=${e.response.status} type=${e.response.headers['content-type'] || ''}`);
      const data = typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data);
      console.log(data.slice(0, 800));
    } else {
      console.log(`error=${e.message}`);
    }
  }
}

await probe('agnes-models', () => axios.get('https://apihub.agnes-ai.com/v1/models', {
  headers: { Authorization: `Bearer ${agnesKey}` }, timeout: 30000, validateStatus: () => true
}));
await probe('agnes-images-gpt-image-1', () => axios.post('https://apihub.agnes-ai.com/v1/images/generations', {
  model: 'gpt-image-1', prompt: 'test album cover', size: '1024x1024'
}, { headers: { Authorization: `Bearer ${agnesKey}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }));
await probe('agnes-images-dall-e-3', () => axios.post('https://apihub.agnes-ai.com/v1/images/generations', {
  model: 'dall-e-3', prompt: 'test album cover', size: '1024x1024'
}, { headers: { Authorization: `Bearer ${agnesKey}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }));
await probe('minimax-models', () => axios.get('https://api.minimaxi.com/v1/models', {
  headers: { Authorization: `Bearer ${minimaxKey}` }, timeout: 30000, validateStatus: () => true
}));
