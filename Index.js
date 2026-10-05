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

const BOT_TOKEN = '';
const CLIENT_ID = '1555997672094302278';
const GUILD_ID = '1382229810335453206';
const API_KEY = 'key_vGV-CNOBdgm-7B6NL3NxGY-5vlQbmUutJYg1SPS0UQ8';
const BASE_URL = 'https://media.rahmat.cc.cd';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// DAFTAR RESOLUSI YOUTUBE (144p - 1080p)
const resolutions = [144, 240, 360, 480, 720, 1080];

const commands = [
    new SlashCommandBuilder()
        .setName('use')
        .setDescription('Unduh Media Sosmed (TikTok, IG, FB, dll)')
        .addStringOption(opt => opt.setName('link').setDescription('Masukkan link media').setRequired(true)),

    new SlashCommandBuilder()
        .setName('usemp3')
        .setDescription('Unduh Audio MP3 / Musik')
        .addStringOption(opt => opt.setName('link').setDescription('Masukkan link musik/audio').setRequired(true)),

    ...resolutions.map(res => 
        new SlashCommandBuilder()
            .setName(`use${res}`)
            .setDescription(`Unduh Video YouTube Kualitas ${res}p`)
            .addStringOption(opt => opt.setName('link').setDescription(`Masukkan link YouTube (${res}p)`).setRequired(true))
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

async function registerCommands() {
    try {
        console.log('⏳ Mendaftarkan Slash Commands...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash Commands berhasil terdaftar!');
    } catch (error) {
        console.error('❌ Error mendaftarkan Slash Commands:', error);
    }
}

// 1. ENGINE TIKTOK LAMA (tikwm.com)
async function getTikTok(url) {
    try {
        const response = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (jsonErr) {
            return { success: false };
        }

        if (result.code === 0 && result.data) {
            let videoPath = result.data.hdplay || result.data.play;
            const fullVideoUrl = videoPath ? (videoPath.startsWith('http') ? videoPath : `https://tikwm.com${videoPath}`) : null;

            if (result.data.images && result.data.images.length > 0) {
                return { 
                    success: true, 
                    isVideo: false, 
                    urls: result.data.images,
                    videoUrl: fullVideoUrl 
                };
            }

            if (fullVideoUrl) {
                return { success: true, isVideo: true, url: fullVideoUrl, title: result.data.title || 'video' };
            }
        }
    } catch (e) {
        console.error('TikTok Fetch error:', e);
    }
    return { success: false };
}

async function getTikTokAudio(url) {
    try {
        const response = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (jsonErr) {
            return { success: false };
        }

        if (data.code === 0 && data.data && data.data.music) {
            const musicUrl = data.data.music.startsWith('http') ? data.data.music : `https://tikwm.com${data.data.music}`;
            return { success: true, url: musicUrl, title: data.data.music_info?.title || 'audio' };
        }
    } catch (e) {
        console.error('TikTok Audio fetch error:', e);
    }
    return { success: false };
}

// 2. ENGINE BACKEND TEMAN (YouTube & Non-TikTok)
async function processBackendTask(targetUrl, isAudioOnly, maxHeight, interaction) {
    let taskId = null;
    try {
        console.log(`⏳ Membuat task backend untuk: ${targetUrl} (Max Height: ${maxHeight || 'Auto'})`);
        
        const payload = {
            url: targetUrl,
            audio_only: isAudioOnly
        };

        if (maxHeight) {
            payload.max_height = parseInt(maxHeight);
        }

        const createRes = await fetch(`${BASE_URL}/v1/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify(payload)
        });

        const taskData = await createRes.json();
        taskId = taskData.task_id || taskData.id || (taskData.data && taskData.data.id);
        
        if (!taskId) {
            return { success: false, error: 'Gagal mendapatkan ID Task dari server API.' };
        }

        let attempts = 0;
        const maxAttempts = 40; 
        let lastStatus = '';

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;

            const checkRes = await fetch(`${BASE_URL}/v1/tasks/${taskId}`, {
                method: 'GET',
                headers: { 'X-API-Key': API_KEY }
            });

            const statusData = await checkRes.json();
            const currentStatus = (statusData.status || statusData.state || '').toLowerCase();
            const progress = statusData.progress ? ` (${statusData.progress}%)` : '';

            if (currentStatus !== lastStatus) {
                lastStatus = currentStatus;
                await interaction.editReply({ 
                    content: `⏳ Memproses media... Status: **${currentStatus}**${progress}` 
                }).catch(() => {});
            }

            if (currentStatus === 'completed' || currentStatus === 'success' || statusData.download_url) {
                const rawDownloadUrl = statusData.download_url || (statusData.result && statusData.result.download_url);
                
                if (rawDownloadUrl) {
                    const finalUrl = rawDownloadUrl.startsWith('http') ? rawDownloadUrl : `${BASE_URL}${rawDownloadUrl}`;
                    return {
                        success: true,
                        downloadUrl: finalUrl,
                        title: statusData.title || statusData.filename || 'Downloaded Media'
                    };
                }
            } else if (currentStatus === 'failed' || currentStatus === 'error') {
                return { success: false, error: statusData.error || 'Proses unduh di server gagal.' };
            }
        }

        if (taskId) {
            fetch(`${BASE_URL}/v1/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': API_KEY }
            }).catch(() => {});
        }

        return { success: false, error: 'Server sedang sibuk/stuck. Silakan coba lagi.' };

    } catch (err) {
        console.error('Backend Task Error:', err);
        return { success: false, error: 'Terjadi kesalahan sistem saat menghubungi API.' };
    }
}

client.once('clientReady', async () => {
    console.log(`🤖 Bot MultiDownloader Online: ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: '/use /use144 - /use1080 /usemp3 ✨', type: ActivityType.Custom }],
        status: 'online',
    });
    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const targetUrl = interaction.options.getString('link');

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        return interaction.reply({ content: '❌ Harap masukkan URL link yang valid!', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const isTikTok = targetUrl.includes('tiktok.com') || targetUrl.includes('vt.tiktok.com');
    const isAudioOnly = commandName === 'usemp3';
    
    // Kurung siku agar Discord tidak membuat auto-embed TikTok yang bikin double
    const formattedUrlText = `<${targetUrl}>`;

    // A. PROSES TIKTOK (PAKAI ENGINE TIKWM LAMA)
    if (isTikTok) {
        if (isAudioOnly) {
            const result = await getTikTokAudio(targetUrl);
            if (result.success) {
                const downloadBtn = new ButtonBuilder()
                    .setLabel('View / Download MP3')
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.url);
                const row = new ActionRowBuilder().addComponents(downloadBtn);

                try {
                    const attachment = new AttachmentBuilder(result.url, { name: `${result.title || 'audio'}.mp3` });
                    await interaction.channel.send({ 
                        content: formattedUrlText, 
                        files: [attachment],
                        components: [row]
                    });
                    await interaction.deleteReply();
                } catch (err) {
                    await interaction.channel.send({ content: formattedUrlText, components: [row] });
                    await interaction.deleteReply();
                }
            } else {
                await interaction.editReply({ content: '❌ Gagal mengambil audio MP3 dari TikTok.' });
            }
            return;
        }

        const result = await getTikTok(targetUrl);
        if (result.success) {
            if (!result.isVideo) {
                const attachments = result.urls.slice(0, 10).map((url, i) => 
                    new AttachmentBuilder(url, { name: `foto_${i + 1}.jpg` })
                );

                let components = [];
                if (result.videoUrl) {
                    const videoBtn = new ButtonBuilder()
                        .setLabel('View / Download Video')
                        .setStyle(ButtonStyle.Link)
                        .setURL(result.videoUrl);
                    components.push(new ActionRowBuilder().addComponents(videoBtn));
                }

                await interaction.channel.send({ 
                    content: formattedUrlText, 
                    files: attachments,
                    components: components
                });
                await interaction.deleteReply();
            } else {
                const downloadBtn = new ButtonBuilder()
                    .setLabel('View / Download Link')
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.url);
                const row = new ActionRowBuilder().addComponents(downloadBtn);

                try {
                    const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });
                    await interaction.channel.send({ 
                        content: formattedUrlText, 
                        files: [attachment],
                        components: [row]
                    });
                    await interaction.deleteReply();
                } catch (err) {
                    await interaction.channel.send({ content: formattedUrlText, components: [row] });
                    await interaction.deleteReply();
                }
            }
        } else {
            await interaction.editReply({ content: '❌ Gagal memproses media TikTok.' });
        }
        return;
    }

    // B. PROSES NON-TIKTOK (PAKAI API BACKEND TEMAN)
    let maxHeight = null;
    if (commandName.startsWith('use') && commandName !== 'use' && commandName !== 'usemp3') {
        maxHeight = commandName.replace('use', '');
    }

    const backendResult = await processBackendTask(targetUrl, isAudioOnly, maxHeight, interaction);

    if (!backendResult.success) {
        return interaction.editReply({ content: `❌ ${backendResult.error}` });
    }

    try {
        const downloadBtn = new ButtonBuilder()
            .setLabel('View / Download File')
            .setStyle(ButtonStyle.Link)
            .setURL(backendResult.downloadUrl);

        const row = new ActionRowBuilder().addComponents(downloadBtn);
        const ext = isAudioOnly ? 'mp3' : 'mp4';

        try {
            const attachment = new AttachmentBuilder(backendResult.downloadUrl, { name: `media.${ext}` });
            await interaction.channel.send({ 
                content: formattedUrlText,
                files: [attachment],
                components: [row]
            });
            await interaction.deleteReply();

        } catch (attachErr) {
            await interaction.channel.send({ 
                content: formattedUrlText,
                components: [row] 
            });
            await interaction.deleteReply();
        }

    } catch (err) {
        console.error('Interaction response error:', err);
        await interaction.editReply({ content: '❌ Terjadi kesalahan saat mengirimkan hasil ke channel.' });
    }
});

client.login(BOT_TOKEN);
