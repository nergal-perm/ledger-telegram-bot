require("isomorphic-fetch");

// SOCKS proxy to connect to (is needed only for local testing purposes)
var SocksProxyAgent = require('socks-proxy-agent');
var proxy = process.env.socks_proxy || 'socks://127.0.0.1:8080';

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
const bot = new Telegraf(conf.get("telegramToken"), {
    telegram: {
        agent: new SocksProxyAgent(proxy)
    }
});

const Composer = require('telegraf/composer');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const WizardScene = require('telegraf/scenes/wizard');

const expenseTypeChooser = new Composer();
expenseTypeChooser.action('продукты', (ctx) => {
    session.state = { expenseType: "Продукты" };
    ctx.reply('Введите сумму:');
    return ctx.wizard.next();
})
expenseTypeChooser.hears(/^Расходы.*/gi, (ctx) => {
    session.state.expenseType = ctx.message.text;
    ctx.reply(`Вы выбрали ${ctx.message.text}, введите сумму:`);
    return ctx.wizard.next();
})
expenseTypeChooser.use((ctx) => ctx.replyWithMarkdown('Выберите или введите категорию расходов!'));

const expenseAmountHandler = new Composer();
var amountRegExp = /^[+-]?\d+([\.,]\d+)?(\s[a-z,а-я]{3})?$/gi;
expenseAmountHandler.hears(amountRegExp, (ctx) => {
    //    /(\s[a-z,а-я]{3})$/gi
    var amountText = ctx.message.text.replace(".",",");
    if(amountText.substr(-4,1) !== " ") {
        amountText += " руб";
    }
    var stringToWrite = `    ${session.state.expenseType}    ${amountText}`.toString();
    updateDropboxFile(stringToWrite);
    ctx.replyWithMarkdown('`Done`');
    return ctx.scene.leave();
});
expenseAmountHandler.use((ctx) => ctx.reply("Введите корректную сумму"));

const superWizard = new WizardScene('super-wizard',
    (ctx) => {
        ctx.reply('Выберите или введите категорию расходов', Markup.inlineKeyboard([
            Markup.callbackButton('Продукты', 'продукты')
        ]).extra());
        return ctx.wizard.next();
    },
    expenseTypeChooser,
    expenseAmountHandler
);


const stage = new Stage([superWizard], { default: 'super-wizard' });
bot.use(session());
bot.use(stage.middleware());
bot.startPolling();


// download file from Dropbox and write something to it
function updateDropboxFile(newExpense) {
    dbx.filesDownload({ path: conf.get('filePath') })
    .then(function(response) {
        var buff = new Buffer(response.fileBinary);
        var stringToWrite = `\n${newExpense}`.toString();
        console.log(stringToWrite);
        uploadFile(Buffer.concat([buff, new Buffer(stringToWrite)]));    
  })
  .catch(function(error) {
    console.log(error);
  });
}

// Upload changed file to Dropbox
function uploadFile(fileContent) {
    dbx.filesUpload({
        contents: fileContent,
        path: conf.get('filePath'),
        mode: "overwrite"
    }).then(function(response) {
        console.log(JSON.stringify(response));
    }).catch(function(error) {
        console.log(JSON.stringify(error.response));
    });
}