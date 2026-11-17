const frases = require('./js/frases');
require('dotenv').config();
const express = require('express');
const { ElevenLabsClient } = require('elevenlabs');

const app = express();
app.use(express.json());
app.use(express.static('.'));

const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
});

app.post('/api/generate-speech', async (req, res) => {
    try {
        const { text, voiceId } = req.body;
        const audio = await elevenlabs.generate({
            voice: voiceId || "21m00Tcm4TlvDq8ikWAM",
            text: text,
            model_id: "eleven_multilingual_v2"
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        audio.pipe(res);
    } catch (error) {
        console.error('Erro na ElevenLabs:', error);
        res.status(500).json({ error: 'Erro ao gerar áudio' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
});
// Rota para gerar a voz clonada na ElevenLabs
app.post('/api/generate-speech', async (req, res) => {
    try {
        const { text } = req.body;
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const voiceId = process.env.VOICE_ID;

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            throw new Error('Erro ao comunicar com a API da ElevenLabs.');
        }

        const audioBuffer = await response.arrayBuffer();
        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error('Erro no servidor:', error);
        res.status(500).send('Erro ao gerar o áudio.');
    }
});