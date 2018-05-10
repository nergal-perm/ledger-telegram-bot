require("isomorphic-fetch");
const moment = require('moment');


// SOCKS proxy to connect to (is needed only for local testing purposes)
/*
var SocksProxyAgent = require('socks-proxy-agent');
var proxy = process.env.socks_proxy || 'socks://127.0.0.1:8080';
var telegramOptions = {
    telegram: {
        agent: new SocksProxyAgent(proxy)
    }
};
*/

// external file configuration setup
const conf = require("nconf");
conf.argv()
    .env()
    .file('main', { file: 'config/main.json', search: true });

// Dropbox official javascript client setup
const Dropbox = require("dropbox").Dropbox;
const dbx = new Dropbox({accessToken: conf.get("dropboxToken")});

// Telegram bot api library setup
const Telegraf = require("telegraf");
const bot = getTelegramBot();

function getTelegramBot(telegramOptions) {
    if (telegramOptions) {
        return new Telegraf(conf.get("telegramToken"), telegramOptions);
    } else {
        return new Telegraf(conf.get("telegramToken"));
    }
}



/*
    Общий ход работы с ботом:
    1. Пользователь отправляет команду /start
    2. Бот определяет пользователя
    3. Бот отправляет список частых категорий
    4. Пользователь выбирает категорию / вводит категорию руками
    5. Бот предлагает ввести сумму и валюту
    6. Пользователь вводит сумму [и валюту]
    7. Бот определяет текущую дату
    8. Бот определяет балансирующий счет на основании пользователя
    9. Бот формирует запись для внесения в Dropbox и обновляет файл
*/



const Composer = require('telegraf/composer');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const WizardScene = require('telegraf/scenes/wizard');

function enterAmountStep(ctx) {
    ctx.reply('Введите сумму:');
    return ctx.wizard.next();    
}

// TODO: Можно вынести в отдельный модуль
const expenseTypeChooser = new Composer();
expenseTypeChooser.action('groceries', (ctx) => {
    session.state = { expenseType: "Продукты" };
    return enterAmountStep(ctx);
});
expenseTypeChooser.action('pet food', (ctx) => {
    session.state = { expenseType: "Корм" };
    return enterAmountStep(ctx);
});
expenseTypeChooser.action('transportation', (ctx) => {
    session.state = { expenseType: "Транспорт" };
    return enterAmountStep(ctx);
});
expenseTypeChooser.hears(/^Расходы.*/gi, (ctx) => {
    session.state.expenseType = ctx.message.text;
    ctx.reply(`Вы выбрали ${ctx.message.text}, введите сумму:`);
    return ctx.wizard.next();
});
expenseTypeChooser.use((ctx) => ctx.replyWithMarkdown('Выберите или введите категорию расходов!'));

// TODO: Можно вынести в отдельный модуль
const expenseAmountHandler = new Composer();
var amountRegExp = /^[+-]?\d+([\.,]\d+)?(\s[a-z,а-я]{3})?$/gi;
expenseAmountHandler.hears(amountRegExp, (ctx) => {
    var expenseRecord = getExpenseRecord(ctx);
    updateDropboxFile(expenseRecord);
    ctx.replyWithMarkdown('`Done`');
    return ctx.scene.leave();
});
expenseAmountHandler.use((ctx) => ctx.reply("Введите корректную сумму"));

function getExpenseRecord(ctx) {
    var dateHeader = getDateHeader(ctx.message.date);
    var expenseText = getExpenseText(ctx);
    var sourceAccount = getSourceAccount(ctx.message.from.id);
    return `${dateHeader}\n${expenseText}\n${sourceAccount}\n\n`.toString();    
}

function getDateHeader(ctxDate) {
    var expenseDate = moment(ctxDate * 1000).format("YYYY/MM/DD");
    return `${expenseDate} * Расходы за день`;
}

function getExpenseText(ctx) {
    var amountText = ctx.message.text.replace(".",",");
    if(amountText.substr(-4,1) !== " ") {
        amountText += " руб";
    }
    return `    ${session.state.expenseType}    ${amountText}`;
}

function getSourceAccount(userId) {
    if (userId === 236735928) {
        return "    Наличные";
    } else {
        return "    Доходы:Ленкин доход";
    }
    
}

const superWizard = new WizardScene('super-wizard',
    (ctx) => {
        ctx.reply('Выберите или введите категорию расходов', Markup.inlineKeyboard([
            Markup.callbackButton('Продукты', 'groceries'),
            Markup.callbackButton('Транспорт', 'transportation'),
            Markup.callbackButton('Корм', 'pet food'),
        ]).extra());
        return ctx.wizard.next();
    },
    expenseTypeChooser,
    expenseAmountHandler
);


const stage = new Stage([superWizard], { default: 'super-wizard' });
bot.use(session());
bot.use(stage.middleware());
bot.command("expense", (ctx) => {
    ctx.wizard.enter();
});
bot.startPolling();


// download file from Dropbox and write something to it
function updateDropboxFile(newExpense) {
    dbx.filesDownload({ path: conf.get('filePath') })
    .then(function(response) {
        var buff = new Buffer(response.fileBinary);
        uploadFile(Buffer.concat([buff, new Buffer(newExpense)]));    
  })
  .catch(function(error) {
    //console.log(error);
  });
}

// Upload changed file to Dropbox
function uploadFile(fileContent) {
    dbx.filesUpload({
        contents: fileContent,
        path: conf.get('filePath'),
        mode: "overwrite"
    }).then(function(response) {
        //console.log(JSON.stringify(response));
    }).catch(function(error) {
        //console.log(JSON.stringify(error.response));
    });
}