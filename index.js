const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const CONFIG = {
    BOT_TOKEN: '8241218547:AAFwWqeCVZuCGt6Nul1RQjxS9citS0xT9QA',
    YOOMONEY_WALLET: '4100118554480098',
    YOOMONEY_TOKEN: '4100118554480098.2C361861CBC96CCE9E4C324D66D38A950BA110BA7A9FD9D7E6A563A50619C9BA11A37CD2B69AED015D6F500DFB30F46053222906D8B84FF9A68CF5DDA04FCA38B71F762C5DE7D26C9B4C1D52A1E604E4EBFB4E2C07EBB1B1C8E78B03D322DBEC7DCDCE2AFF2DF60D73CBA0574D8C932C9D0A466DFA1',
    SECRET_KEY: 'iEI6BDq/spHECVZ6IrV7+t6J',
    CURRENCY_RATE: 100
};

let users = {};
let payments = {};

try {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    }
    if (fs.existsSync('payments.json')) {
        payments = JSON.parse(fs.readFileSync('payments.json', 'utf8'));
    }
} catch(e) {}

function saveData() {
    try {
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        fs.writeFileSync('payments.json', JSON.stringify(payments, null, 2));
    } catch(e) {}
}

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
const app = express();
app.use(express.json());

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!users[userId]) {
        users[userId] = { 
            balance: 0, 
            username: msg.from.username || 'User',
            first_name: msg.from.first_name || 'Игрок'
        };
        saveData();
    }
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💎 Купить валюту', callback_data: 'buy_currency' }],
                [{ text: '💰 Мой баланс', callback_data: 'check_balance' }],
                [{ text: '📋 История покупок', callback_data: 'history' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, 
        `🎮 *Магазин игровой валюты*\n\n` +
        `Привет, ${users[userId].first_name}!\n` +
        `Ваш баланс: ${users[userId].balance} монет\n\n` +
        `Курс: 1 ₽ = ${CONFIG.CURRENCY_RATE} монет`,
        { ...keyboard, parse_mode: 'Markdown' }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    try {
        await bot.answerCallbackQuery(query.id);
    } catch(e) {}
    
    if (data === 'buy_currency') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 100 монет (1 ₽)', callback_data: 'pay_1' }],
                    [{ text: '💎 500 монет (5 ₽)', callback_data: 'pay_5' }],
                    [{ text: '💎 1000 монет (10 ₽)', callback_data: 'pay_10' }],
                    [{ text: '💎 5000 монет (50 ₽)', callback_data: 'pay_50' }],
                    [{ text: '⬅️ Назад', callback_data: 'back_to_menu' }]
                ]
            }
        };
        bot.sendMessage(chatId, '💎 *Выберите количество валюты:*', { ...keyboard, parse_mode: 'Markdown' });
    }
    
    else if (data.startsWith('pay_')) {
        const amount = parseInt(data.split('_')[1]);
        const paymentId = uuidv4();
        
        const payUrl = `https://yoomoney.ru/quickpay/confirm.xml?` +
            `receiver=${CONFIG.YOOMONEY_WALLET}&` +
            `quickpay-form=shop&` +
            `targets=Покупка%20игровой%20валюты&` +
            `paymentType=SB&` +
            `sum=${amount}&` +
            `label=${paymentId}`;
        
        payments[paymentId] = {
            user_id: userId,
            amount_rub: amount,
            currency_amount: amount * CONFIG.CURRENCY_RATE,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        saveData();
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 Оплатить', url: payUrl }],
                    [{ text: '✅ Я оплатил', callback_data: `check_${paymentId}` }],
                    [{ text: '⬅️ Назад', callback_data: 'buy_currency' }]
                ]
            }
        };
        
        bot.sendMessage(chatId, 
            `🛒 *Заказ #${paymentId.slice(0, 8)}*\n\n` +
            `📦 Товар: Игровая валюта\n` +
            `💵 Сумма: ${amount} ₽\n` +
            `💎 Получите: ${amount * CONFIG.CURRENCY_RATE} монет\n\n` +
            `👉 Нажмите "Оплатить" для перехода к оплате`,
            { ...keyboard, parse_mode: 'Markdown' }
        );
    }
    
    else if (data.startsWith('check_')) {
        const paymentId = data.substring(6);
        const payment = payments[paymentId];
        
        if (payment && payment.status === 'completed') {
            if (!users[userId]) {
                users[userId] = { balance: 0 };
            }
            bot.sendMessage(chatId, 
                `✅ *Оплата подтверждена!*\n\n` +
                `💎 Начислено: ${payment.currency_amount} монет\n` +
                `💰 Ваш баланс: ${users[userId].balance} монет`,
                { parse_mode: 'Markdown' }
            );
        } else {
            bot.sendMessage(chatId, 
                '⏳ *Оплата еще не поступила*\n\n' +
                'Пожалуйста, завершите оплату и нажмите "Я оплатил" снова через минуту.',
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    else if (data === 'check_balance') {
        if (!users[userId]) {
            users[userId] = { balance: 0 };
        }
        bot.sendMessage(chatId, 
            `💰 *Ваш баланс*\n\n` +
            `💎 Монет: ${users[userId].balance}\n` +
            `Курс: 1 ₽ = ${CONFIG.CURRENCY_RATE} монет`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'history') {
        const userPayments = Object.entries(payments)
            .filter(([_, p]) => p.user_id === userId)
            .reverse()
            .slice(0, 10);
        
        if (userPayments.length === 0) {
            bot.sendMessage(chatId, '📋 У вас пока нет покупок');
        } else {
            let history = '📋 *История покупок:*\n\n';
            userPayments.forEach(([id, p]) => {
                const status = p.status === 'completed' ? '✅' : '⏳';
                const date = new Date(p.created_at).toLocaleDateString('ru-RU');
                const time = new Date(p.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                history += `${status} ${p.currency_amount} монет (${p.amount_rub}₽)\n${date} в ${time}\n\n`;
            });
            bot.sendMessage(chatId, history, { parse_mode: 'Markdown' });
        }
    }
    
    else if (data === 'back_to_menu') {
        if (!users[userId]) {
            users[userId] = { balance: 0 };
        }
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 Купить валюту', callback_data: 'buy_currency' }],
                    [{ text: '💰 Мой баланс', callback_data: 'check_balance' }],
                    [{ text: '📋 История покупок', callback_data: 'history' }]
                ]
            }
        };
        
        bot.sendMessage(chatId, 
            `🎮 *Магазин игровой валюты*\n\n` +
            `Ваш баланс: ${users[userId].balance} монет\n\n` +
            `Курс: 1 ₽ = ${CONFIG.CURRENCY_RATE} монет`,
            { ...keyboard, parse_mode: 'Markdown' }
        );
    }
});

app.post('/yoomoney-hook', (req, res) => {
    const body = req.body;
    console.log('Получено уведомление:', body);
    
    // Проверка подписи
    const sha1 = crypto.createHash('sha1');
    const params = [
        body.notification_type,
        body.operation_id,
        body.amount,
        body.currency,
        body.datetime,
        body.sender,
        body.codepro,
        CONFIG.SECRET_KEY,
        body.label
    ].join('&');
    
    const signature = sha1.update(params).digest('hex');
    
    if (signature !== body.sha1_hash) {
        console.log('❌ Неверная подпись');
        return res.status(401).send('Invalid signature');
    }
    
    if (body.notification_type === 'p2p-incoming' && !body.codepro) {
        const paymentId = body.label;
        const amount = parseFloat(body.amount);
        
        console.log(`💰 Платеж: ${amount}₽, ID: ${paymentId}`);
        
        if (payments[paymentId] && payments[paymentId].status === 'pending') {
            payments[paymentId].status = 'completed';
            
            const userId = payments[paymentId].user_id;
            const currencyAmount = payments[paymentId].currency_amount;
            
            if (!users[userId]) {
                users[userId] = { balance: 0 };
            }
            users[userId].balance += currencyAmount;
            
            saveData();
            
            console.log(`✅ Начислено ${currencyAmount} монет пользователю ${userId}`);
            
            bot.sendMessage(userId, 
                `✅ *Оплата получена!*\n\n` +
                `💵 Сумма: ${amount} ₽\n` +
                `💎 Начислено: ${currencyAmount} монет\n` +
                `💰 Баланс: ${users[userId].balance} монет\n\n` +
                `Спасибо за покупку! 🎮`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    
    if (process.env.RENDER_EXTERNAL_URL) {
        const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${CONFIG.BOT_TOKEN}`;
        bot.setWebHook(webhookUrl);
        console.log(`🔗 Webhook установлен: ${webhookUrl}`);
    } else {
        bot.startPolling();
        console.log('📡 Polling mode активен');
    }
});

console.log('🤖 Бот готов к работе!');
