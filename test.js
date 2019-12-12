const express = require("express");
const app = express();
const FormData = require('form-data');
const fs = require('fs');
const puppeteer   = require('puppeteer');
var https = require('https');
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

app.use(express.static("./public"));
app.set("view engine", "ejs");
app.set("views", './views');
app.use(express.json());

var cachePort = {};
var cacheSms  = {};
var password = '123asdASD'; //password default
// var cachePort = {"3000": '', "3001": '', "3002": '', "3003": '', "3004": '', "3005": '', "3006": '', "3007": '', "3008": '', "3009": '', "3010": '', "3011": '', "3012": '', "3013": '', "3014": '', "3015": ''};
var serverCore = require("http").Server(app);
var ioCore = require("socket.io")(serverCore);
serverCore.listen(2999,  () => {
  console.log(`Listening to requests on http://localhost:2999`);
});

var socketCore = ioCore.listen(serverCore);
socketCore.on("connection", function(socket) {
  console.log('catch on iosocket client id: ' + socket.id);

  socket.on("Client-set-password", function(data) {
    password = data;
    socketCore.emit("Server-send-password", {"password": password});
  })

  socket.on("disconnect", function() {
    console.log(socket.id + "disconnect");
  });
});

app.get("/", (req, res) => {
  console.log(JSON.stringify(cachePort));
  console.log('SET PASSWORD: ' + password);
  res.render("home", { "cache": cachePort, "cacheSms": cacheSms, "password": password });
});

app.post("/get-state-gsm", (req, res) => {
  var phone = req.body.phone;
  var port = req.body.port;

  cachePort[port] = phone;
  socketCore.emit("GMS-send-data", {"phone": phone, "port": port, cachePort});
  res.json({"status": true});
});

app.post("/start-registor", (req, res) => {
  console.log('*** START REGISTOR ****');
  console.log('Phone: ' + req.body.phone);
  console.log('Account: ' + req.body.account);
  console.log('Password: ' + req.body.password);
  var dataResponse = {
    'phone': req.body.phone,
    'account': req.body.account,
    'password': req.body.password,
    'port': req.body.port,
    'sms': '',
    'captcha': 'CAPCHA_NOT_READY',
    'status': 'success',
  }

  puppeteer.launch({
    headless: false,
  }).then(async browser => {
    const page = await browser.newPage();

    await page.goto('https://shopee.vn', {
      waitUntil: 'networkidle2', timeout: 0
    });

    await page.evaluate(() => {
      document.querySelector('.shopee-popup__close-btn').click();
      document.querySelector('.navbar__links li:nth-child(3)').click();
      return true;
    });

    await page.waitForSelector("[placeholder='Số điện thoại']");
    await page.type("[placeholder='Số điện thoại']", req.body.phone);

    await page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._1DS4JM > div:nth-child(2) > div > button");

    await page.waitForSelector("[placeholder='Tên đăng nhập']");
    await page.type("[placeholder='Tên đăng nhập']", req.body.account);

    await page.waitForSelector("[placeholder='Mật khẩu']");
    await page.type("[placeholder='Mật khẩu']", req.body.password);

    await page.waitForSelector("[placeholder='Xác nhận mật khẩu']");
    await page.type("[placeholder='Xác nhận mật khẩu']", req.body.password);

    element = await page.$("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._1DS4JM > div:nth-child(7) > div > img");
    await page.waitFor(1000);
    await element.screenshot({
      path: 'captcha.png',
    });

    var form = new FormData();
    form.append("key", '13c5f43fbe274844affe8cc4e7bbce0a');
    form.append("method", 'post');
    form.append('file', fs.createReadStream('./captcha.png'));
    form.submit('https://2captcha.com/in.php', async (err, res) => {
      if (err) {
        console.log('err');
      }

      res.setEncoding('utf8');
      res.on('data', function (captchaCode) {
        captchaCode = captchaCode.split('|')[1];
        api = 'https://2captcha.com/res.php?key=13c5f43fbe274844affe8cc4e7bbce0a&action=get&id=' + captchaCode;

        //wait for captcha encode
        // setTimeout(function() {
        //   https.get(api, (resp) => {
        //     resp.setEncoding('utf8');
        //     resp.on('data', function (captcha) {
        //       if (captcha != 'CAPCHA_NOT_READY') {
        //         dataResponse['captcha'] = captcha.split('|')[1];
        //         page.type("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", dataResponse['captcha']);
        //       }
        //     })
        //   }).on("error", (err) => {
        //     console.log("Error: " + err.message);
        //   }).end()
        // }, 5000);

        while (dataResponse['captcha'] == 'CAPCHA_NOT_READY') {
          setTimeout(function() {
            https.get(api, (resp) => {
              resp.setEncoding('utf8');
              resp.on('data', function (captcha) {
                if (captcha != 'CAPCHA_NOT_READY') {
                  dataResponse['captcha'] = captcha.split('|')[1];
                  page.type("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", '');
                  page.type("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", captcha);
                  // var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
                  // var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
                  if (dataResponse['captcha'] != 'CAPCHA_NOT_READY' && dataResponse['sms'].length > 2 ) {
                    // submit form
                    page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
                    return res.json({"status": true, data: dataResponse});
                  }
                }
              })
            }).on("error", (err) => {
              console.log("Error: " + err.message);
            }).end()
          }, 5000);
        }
      });
      res.resume();
    });

    setTimeout(function() {
      console.log('wait for sms...');
      console.log(cacheSms[req.body.phone]);
      if (cacheSms[req.body.phone] != undefined) {
        // var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
        // var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
        page.type("[placeholder='Mã xác minh']", '');
        page.type("[placeholder='Mã xác minh']", cacheSms[req.body.phone]);

        if (dataResponse['captcha'] != 'CAPCHA_NOT_READY' && dataResponse['sms'].length > 2 ) {
          // submit form
          page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
          return res.json({"status": true, data: dataResponse});
        }
      }
    }, 5000);

    setTimeout(function() {
      console.log('wait for sms...');
      console.log(cacheSms[req.body.phone]);
      if (cacheSms[req.body.phone] != undefined) {
        var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
        var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
        if (inputSms.length < 2) {
          page.type("[placeholder='Mã xác minh']", cacheSms[req.body.phone]);
        }
        if (inputSms.length > 2 && inputCaptcha.length > 2 ) {
          dataResponse['sms'] = inputSms;
          // submit form
          page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
          return res.json({"status": true, data: dataResponse});
        }
      }
    }, 10000);

    setTimeout(function() {
      console.log('wait for sms...');
      console.log(cacheSms[req.body.phone]);
      if (cacheSms[req.body.phone] != undefined) {
        var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
        var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
        if (inputSms.length < 2) {
          page.type("[placeholder='Mã xác minh']", cacheSms[req.body.phone]);
        }
        if (inputSms.length > 2 && inputCaptcha.length > 2 ) {
          dataResponse['sms'] = inputSms;
          // submit form
          page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
          return res.json({"status": true, data: dataResponse});
        }
      }
    }, 15000);

    setTimeout(function() {
      console.log('wait for sms...');
      console.log(cacheSms[req.body.phone]);
      if (cacheSms[req.body.phone] != undefined) {
        var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
        var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
        console.log(inputSms);
        if (inputSms.length < 2) {
          page.type("[placeholder='Mã xác minh']", cacheSms[req.body.phone]);
        }
        if (inputSms.length > 2 && inputCaptcha.length > 2 ) {
          dataResponse['sms'] = inputSms;
          // submit form
          page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
          return res.json({"status": true, data: dataResponse});
        }
      }
    }, 20000);

    setTimeout(function() {
      console.log('wait for sms...');
      console.log(cacheSms[req.body.phone]);
      if (cacheSms[req.body.phone] != undefined) {
        var inputCaptcha = page.$eval("[placeholder='Nhập mã ngẫu nhiên/mã hiển thị ở bên phải']", el => el.value);
        var inputSms = page.$eval("[placeholder='Mã xác minh']", el => el.value);
        if (inputSms.length < 2) {
          page.type("[placeholder='Mã xác minh']", cacheSms[req.body.phone]);
        }
        if (inputSms.length > 2 && inputCaptcha.length > 2 ) {
          dataResponse['sms'] = inputSms;
          // submit form
          page.click("#modal > div > div.shopee-modal__content._2g2zXM > div > div > div._3mQbMN > div._2inqg4 > button._2DvX7K._3j9-lD._3ddytl.SjORHu");
          return res.json({"status": true, data: dataResponse});
        }
      }
    }, 20000);
  });
});

app.post('/get-sms-gsm', (req, res) => {
  cacheSms[req.body.phone] = req.body.sms;
  console.log(cacheSms);
  socketCore.emit("GSM-send-sms", {"phone": req.body.phone, "sms": req.body.sms});

  res.json({"status": true});
})

var server3000 = require("http").Server(app);
var io3000 = require("socket.io")(server3000);
server3000.listen(3000,  () => {
  console.log(`Listening to requests on http://localhost:3000`);
});

var socket3000 = io3000.listen(server3000);
socket3000.on("connection", function(socket) {
   socket.on("disconnect", function() {
     console.log(socket.id + "disconnect");
   });

   socket.on("Client-send-data", function(data) {
     console.log(data);
    //  io.sockets.emit("Server-send-data", '*' + data + '*');
     socket.broadcast.emit("Server-send-data", '*' + data + '*');
   })
});
