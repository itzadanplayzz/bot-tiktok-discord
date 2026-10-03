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
    ActivityType 
} = require('discord.js');

const BOT_TOKEN = 'MTU1NTk5NzY3MjA5NDMwMjI3OA.GuNHaV.xlENFpZAoqHMjZOwRbCIDF8sVnvAfdg0_g53AE';
const CLIENT_ID = '1555997672094302278';
const GUILD_ID = '1382229810335453206';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// MEMBUAT 3 SLASH COMMANDS RESMI: /use, /usemp3, /usemp4
const commands = [
    new SlashCommandBuilder()
        .setName('use')
        .setDescription('Unduh Video / Slide Foto TikTok')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link TikTok')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('usemp4')
        .setDescription('Unduh Video MP4 TikTok')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link TikTok')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('usemp3')
        .setDescription('Unduh Audio MP3 TikTok')
        .addStringOption(option => 
            option.setName('link')
                .setDescription('Masukkan link TikTok')
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
        console.log('✅ Instant Guild Slash Commands (/use, /usemp3, /usemp4) berhasil terdaftar!');
    } catch (error) {
        console.error('❌ Error mendaftarkan Guild Slash Commands:', error);
    }
}

// ENGINE TIKTOK
async function getTikTok(url) {
    try {
        const response = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
        const result = await response.json();

        if (result.code === 0) {
            if (result.data.images && result.data.images.length > 0) {
                return { success: true, isVideo: false, urls: result.data.images };
            }
            let videoPath = result.data.hdplay || result.data.play;
            if (videoPath) {
                const fullUrl = videoPath.startsWith('http') ? videoPath : `https://tikwm.com${videoPath}`;
                return { success: true, isVideo: true, url: fullUrl };
            }
        }
    } catch (e) {}
    return { success: false };
}

// ENGINE MP3
async function getAudio(url) {
    try {
        const res = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data.code === 0 && data.data.music) {
            const musicUrl = data.data.music.startsWith('http') ? data.data.music : `https://tikwm.com${data.data.music}`;
            return { success: true, url: musicUrl, title: data.data.music_info?.title || 'audio' };
        }
    } catch (e) {}
    return { success: false };
}

client.once('ready', async () => {
    console.log(`🤖 Bot TikTok Slash Downloader Online: ${client.user.tag}`);

    // SET STATUS GELEMBUNG DI PROFILE (AVATAR PRESENCE)
    client.user.setPresence({
        activities: [{ 
            name: '/use /usemp3 /usemp4 ✨', 
            type: ActivityType.Custom 
        }],
        status: 'online',
    });

    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const targetUrl = interaction.options.getString('link');

    if (!targetUrl.includes('tiktok.com')) {
        return interaction.reply({ content: '❌ Harap masukkan URL link TikTok yang valid!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // HANDLER /usemp3
    if (commandName === 'usemp3') {
        const result = await getAudio(targetUrl);

        if (result.success) {
            try {
                const attachment = new AttachmentBuilder(result.url, { name: `${result.title || 'audio'}.mp3` });
                await interaction.channel.send({ files: [attachment] });
                await interaction.deleteReply();
            } catch (err) {
                const viewBtn = new ButtonBuilder()
                    .setLabel('View / Download MP3')
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.url);

                const row = new ActionRowBuilder().addComponents(viewBtn);

                await interaction.channel.send({ components: [row] });
                await interaction.deleteReply();
            }
        } else {
            await interaction.editReply({ content: '❌ Gagal mengambil audio MP3.' });
        }
        return;
    }

    // HANDLER /use DAN /usemp4
    if (commandName === 'use' || commandName === 'usemp4') {
        const result = await getTikTok(targetUrl);

        if (result.success) {
            if (!result.isVideo) {
                const attachments = result.urls.slice(0, 10).map((url, i) => 
                    new AttachmentBuilder(url, { name: `foto_${i + 1}.jpg` })
                );

                await interaction.channel.send({ files: attachments });
                await interaction.deleteReply();

            } else {
                const viewBtn = new ButtonBuilder()
                    .setLabel('View / Download Link')
                    .setStyle(ButtonStyle.Link)
                    .setURL(result.url);

                const row = new ActionRowBuilder().addComponents(viewBtn);

                try {
                    const attachment = new AttachmentBuilder(result.url, { name: 'video.mp4' });

                    await interaction.channel.send({ 
                        files: [attachment],
                        components: [row]
                    });

                    await interaction.deleteReply();

                } catch (err) {
                    await interaction.channel.send({ 
                        components: [row] 
                    });

                    await interaction.deleteReply();
                }
            }
        } else {
            await interaction.editReply({ content: '❌ Gagal memproses media TikTok.' });
        }
    }
});

client.login(BOT_TOKEN);
          
