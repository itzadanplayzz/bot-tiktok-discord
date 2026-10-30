const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder,
    ActivityType,
    MessageFlags
} = require('discord.js');

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BOT_TOKEN = '';
const CLIENT_ID = '1555997672094302278';
const GUILD_ID = '1382229810335453206';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// deskripsi
const commands = [
    new SlashCommandBuilder()
        .setName('use')
        .setDescription('Unduh Video (TikTok, IG, YT, X, FB, dll)')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link media')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('usemp4')
        .setDescription('Unduh Video MP4 (TikTok, IG, YT, X, FB, dll)')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link media')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('usemp3')
        .setDescription('Unduh Audio MP3 (TikTok, IG, YT, X, FB, dll)')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link media')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

async function registerCommands() {
    try {
        console.log('⏳ Mendaftarkan Slash Commands ke Server ID: ' + GUILD_ID + '...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Instant Guild Slash Commands berhasil terdaftar!');
    } catch (error) {
        console.error('❌ Error mendaftarkan Guild Slash Commands:', error);
    }
}

// --- FUNGSI DOWNLOAD & RENDER FFMPEG (KHUSUS TIKTOK) ---
async function downloadFile(url, filepath) {
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function renderSingleTikTokSlide(imageUrl, audioPathUrl, uniqueId) {
    return new Promise(async (resolve, reject) => {
        const tempDir = path.join(__dirname, `temp_${uniqueId}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
            const audioUrl = audioPathUrl.startsWith('http') ? audioPathUrl : `https://tikwm.com${audioPathUrl}`;
            const audioPath = path.join(tempDir, 'audio.mp3');
            await downloadFile(audioUrl, audioPath);

            const imagePath = path.join(tempDir, 'img.jpg');
            await downloadFile(imageUrl, imagePath);

            const outputPath = path.join(tempDir, 'output.mp4');
            const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${outputPath}"`;

            exec(ffmpegCmd, (error) => {
                if (error) return reject(error);
                resolve({ outputPath, tempDir });
            });
        } catch (err) {
            reject(err);
        }
    });
}

// --- ENGINE 1: TIKTOK (TIKWM) ---
async function getTikTok(url) {
    try {
        const response = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const text = await response.text();
        let result;
        try { result = JSON.parse(text); } catch (jsonErr) { return { success: false }; }

        if (result.code === 0 && result.data) {
            let videoPath = result.data.hdplay || result.data.play;
            const fullVideoUrl = videoPath ? (videoPath.startsWith('http') ? videoPath : `https://tikwm.com${videoPath}`) : null;

            if (result.data.images && result.data.images.length > 0) {
                return { 
                    success: true, 
                    isVideo: false, 
                    urls: result.data.images,
                    videoUrl: fullVideoUrl,
                    audioUrl: result.data.music
                };
            }

            if (fullVideoUrl) { return { success: true, isVideo: true, url: fullVideoUrl }; }
        }
    } catch (e) {}
    return { success: false };
}

async function getAudio(url) {
    try {
        const response = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (jsonErr) { return { success: false }; }

        if (data.code === 0 && data.data && data.data.music) {
            const musicUrl = data.data.music.startsWith('http') ? data.data.music : `https://tikwm.com${data.data.music}`;
            return { success: true, url: musicUrl, title: data.data.music_info?.title || 'audio' };
        }
    } catch (e) {}
    return { success: false };
}

// --- ENGINE 2: MULTI-DOWNLOADER 20+ SITUS (COBALT API) ---
async function getMultiMedia(url, isAudioOnly = false) {
    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: JSON.stringify({
                url: url,
                isAudioOnly: isAudioOnly,
                aFormat: 'mp3',
                vQuality: '720' // Set kualitas video default HD
            })
        });
        
        const data = await response.json();
        
        // Menangani url video tunggal atau url picker (seperti carousel IG)
        if (data && (data.url || data.picker)) {
            const finalUrl = data.url || data.picker[0]?.url;
            return { success: true, url: finalUrl };
        }
    } catch (err) {
        console.error('Cobalt API error:', err);
    }
    return { success: false };
}

client.once('clientReady', async () => {
    console.log(`🤖 Bot Multi-Downloader Online: ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: '/use /usemp3 (TikTok, IG, YT, X) ✨', type: ActivityType.Custom }],
        status: 'online',
    });
    await registerCommands();
});

// --- FITUR AUTO-DETECT LINK DARI CHAT ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Mendeteksi semua jenis link (bukan cuma TikTok)
    const urlRegex = /(https?:\/\/[^\s]+)/;
    const match = message.content.match(urlRegex);

    if (match) {
        const targetUrl = match[1];
        
        // Filter agar bot hanya memproses situs yang didukung (mencegah bot mendownload link web sembarangan)
        const supportedDomains = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'facebook.com', 'fb.watch', 'reddit.com', 'pinterest.com'];
        const isSupported = supportedDomains.some(domain => targetUrl.includes(domain));
        
        if (!isSupported) return;
        
        try { await message.delete(); } catch (err) {}

        const captionText = `🔗 <${targetUrl}>`;
        const loadingMsg = await message.channel.send({ content: '⏳ Sedang memproses media... (Estimasi: 2-5 detik)' });
        
        const isTikTok = targetUrl.includes('tiktok.com');

        // JIKA LINK TIKTOK -> Eksekusi pakai Engine 1 (TikWM)
        if (isTikTok) {
            const result = await getTikTok(targetUrl);
            if (result.success) {
                if (!result.isVideo) {
                    if (result.urls.length === 1) {
                        await loadingMsg.edit({ content: '⏳ menyatukan foto & musik...' });
                        try {
                            const renderData = await renderSingleTikTokSlide(result.urls[0], result.audioUrl, message.id);
                            const attachment = new AttachmentBuilder(renderData.outputPath, { name: 'slide_video.mp4' });

                            await message.channel.send({ content: captionText, files: [attachment] });
                            await loadingMsg.delete(); 
                            fs.rmSync(renderData.tempDir, { recursive: true, force: true });
                        } catch (renderErr) {
                            await loadingMsg.edit({ content: `❌ Gagal merender foto menjadi video.\n${captionText}` });
                        }
                    } else {
                        const attachments = result.urls.slice(0, 10).map((url, i) => 
                            new AttachmentBuilder(url, { name: `foto_${i + 1}.jpg` })
                        );
                        await message.channel.send({ content: captionText, files: attachments });
                        await loadingMsg.delete(); 
                    }
                } else {
                    const viewBtn = new ButtonBuilder().setLabel('View / Download Link').setStyle(ButtonStyle.Link).setURL(result.url);
                    const row = new ActionRowBuilder().addComponents(viewBtn);

                    try {
                        const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });
                        await message.channel.send({ content: captionText, files: [attachment], components: [row] });
                        await loadingMsg.delete(); 
                    } catch (err) {
                        await message.channel.send({ content: captionText, components: [row] });
                        await loadingMsg.delete(); 
                    }
                }
            } else {
                await loadingMsg.edit({ content: `❌ Gagal memproses media. Server down atau link tidak valid.\n${captionText}` });
            }
        } 
        
        // JIKA BUKAN TIKTOK (IG, YT, TWITTER, DLL) -> Eksekusi pakai Engine 2 (Cobalt)
        else {
            const result = await getMultiMedia(targetUrl, false);
            
            if (result.success) {
                const viewBtn = new ButtonBuilder().setLabel('View / Download Link').setStyle(ButtonStyle.Link).setURL(result.url);
                const row = new ActionRowBuilder().addComponents(viewBtn);

                try {
                    const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });
                    await message.channel.send({ content: captionText, files: [attachment], components: [row] });
                    await loadingMsg.delete(); 
                } catch (err) {
                    await message.channel.send({ content: captionText, components: [row] });
                    await loadingMsg.delete(); 
                }
            } else {
                await loadingMsg.edit({ content: `❌ Gagal memproses media. Server down atau link tidak valid.\n${captionText}` });
            }
        }
    }
});

// --- FITUR SLASH COMMANDS ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const targetUrl = interaction.options.getString('link');
    const captionText = `<${targetUrl}>`;

    // Hilangkan batasan TikTok only agar user bisa naruh link IG, YT, X
    const supportedDomains = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'facebook.com', 'fb.watch', 'reddit.com', 'pinterest.com'];
    const isSupported = supportedDomains.some(domain => targetUrl.includes(domain));

    if (!isSupported) {
        return interaction.reply({ content: '❌ Harap masukkan URL link media (TikTok, IG, YT, X, FB) yang valid!', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const isTikTok = targetUrl.includes('tiktok.com');

    // HANDLER /usemp3
    if (commandName === 'usemp3') {
        const result = isTikTok ? await getAudio(targetUrl) : await getMultiMedia(targetUrl, true);

        if (result.success) {
            const viewBtn = new ButtonBuilder()
                .setLabel('View / Download MP3')
                .setStyle(ButtonStyle.Link)
                .setURL(result.url);
            const row = new ActionRowBuilder().addComponents(viewBtn);

            try {
                const attachment = new AttachmentBuilder(result.url, { name: `${isTikTok ? (result.title || 'audio') : 'audio'}.mp3` });
                await interaction.channel.send({ content: captionText, files: [attachment], components: [row] });
                await interaction.deleteReply();
            } catch (err) {
                await interaction.channel.send({ content: captionText, components: [row] });
                await interaction.deleteReply();
            }
        } else {
            await interaction.editReply({ content: '❌ Gagal memproses media. Server down atau link tidak valid.' });
        }
        return;
    }

    // HANDLER /use DAN /usemp4
    if (commandName === 'use' || commandName === 'usemp4') {
        if (isTikTok) {
            const result = await getTikTok(targetUrl);
            if (result.success) {
                if (!result.isVideo) {
                    if (result.urls.length === 1) {
                        await interaction.editReply({ content: '⏳ Menyatukan foto & musik...' });
                        try {
                            const renderData = await renderSingleTikTokSlide(result.urls[0], result.audioUrl, interaction.id);
                            const attachment = new AttachmentBuilder(renderData.outputPath, { name: 'slide_video.mp4' });

                            await interaction.channel.send({ content: captionText, files: [attachment] });
                            await interaction.deleteReply(); 
                            fs.rmSync(renderData.tempDir, { recursive: true, force: true });
                        } catch (renderErr) {
                            await interaction.editReply({ content: '❌ Gagal merender foto menjadi video.' });
                        }
                    } else {
                        const attachments = result.urls.slice(0, 10).map((url, i) => 
                            new AttachmentBuilder(url, { name: `foto_${i + 1}.jpg` })
                        );
                        await interaction.channel.send({ content: captionText, files: attachments });
                        await interaction.deleteReply();
                    }
                } else {
                    const viewBtn = new ButtonBuilder().setLabel('View / Download Link').setStyle(ButtonStyle.Link).setURL(result.url);
                    const row = new ActionRowBuilder().addComponents(viewBtn);

                    try {
                        const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });
                        await interaction.channel.send({ content: captionText, files: [attachment], components: [row] });
                        await interaction.deleteReply();
                    } catch (err) {
                        await interaction.channel.send({ content: captionText, components: [row] });
                        await interaction.deleteReply();
                    }
                }
            } else {
                await interaction.editReply({ content: '❌ Gagal memproses media. Server down atau link tidak valid.' });
            }
        } else {
            // EKSEKUSI MULTI-MEDIA (IG, YT, DLL)
            const result = await getMultiMedia(targetUrl, false);
            if (result.success) {
                const viewBtn = new ButtonBuilder().setLabel('View / Download Link').setStyle(ButtonStyle.Link).setURL(result.url);
                const row = new ActionRowBuilder().addComponents(viewBtn);

                try {
                    const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });
                    await interaction.channel.send({ content: captionText, files: [attachment], components: [row] });
                    await interaction.deleteReply();
                } catch (err) {
                    await interaction.channel.send({ content: captionText, components: [row] });
                    await interaction.deleteReply();
                }
            } else {
                await interaction.editReply({ content: '❌ Gagal memproses media. Server down atau link tidak valid.' });
            }
        }
    }
});

client.login(BOT_TOKEN);