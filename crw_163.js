var fs = require('fs');
var myRequest = require('request');
var myCheerio = require('cheerio');
var myIconv = require('iconv-lite');
require('date-utils');
var mysql = require('./mysql.js');//mysql在相同文件夹下的mysql.js

var source_name = "网易新闻";
var domain = 'https://news.163.com/';
var myEncoding = "utf-8";
var seedURL = 'https://news.163.com/';

// 匹配提取网页中的信息
// 用于提取所有的连接供后续筛选
var seedURL_format = "$('a')";
// 用于匹配提取关键字
var keywords_format = " $('meta[name=\"keywords\"]').eq(0).attr(\"content\")";
// 用于匹配提取标题
var title_format = "$('.post_title').text()";
// 用于匹配提取日期
var date_format = "$('html#ne_wrap').attr(\"data\-publishtime\")";//
// 用于匹配提取作者
var author_format = "$('.ep-editor').text()";
// 用于匹配提取内容
var content_format = "$('.post_body').text()";
var desc_format = " $('meta[name=\"description\"]').eq(0).attr(\"content\")";
var source_format = "$('#ne_article_source').text()";
// 用于匹配判别新闻网址
var url_reg = /\/(\d{2})\/(\d{4})\/(\d{2})\/([A-Z0-9]{16}).html/;
var url_reg = /\/(\d{2})\/(\d{4})\/(\d{2})\/([A-Z0-9]{16}).html/;
//var url_reg = "https://www.163.com/news/article/HPKKM6IU0001899N.html"

var regExp = /((\d{4}|\d{2})(\-|\/|\.)\d{1,2}\3\d{1,2})|(\d{4}年\d{1,2}月\d{1,2}日)/
let n = 0
//防止网站屏蔽我们的爬虫
var headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.65 Safari/537.36'
}

//request模块异步fetch url
function request(url, callback) {
    var options = {
        url: url,
        encoding: null,
        //proxy: 'http://x.x.x.x:8080',
        headers: headers,
        timeout: 10000 //
    }
    myRequest(options, callback)
};

seedget();

function seedget() {
    //读取种子页面
    request(seedURL, function (err, res, body) { 
        try {
            // 用iconv转换编码
            var html = myIconv.decode(body, 'UTF-8');
            console.log("----》读取种子页面")
            //console.log(html);
            // 准备用cheerio解析html
            var $ = myCheerio.load(html, { decodeEntities: true });
        } catch (e) { console.log('读种子页面并转码出错：' + e) };

        var seedurl_news;
        
        try {
            seedurl_news = eval(seedURL_format);
            console.log("----》读取种子页面中所有a连接")
        } catch (e) { console.log('url列表所处的html块识别出错：' + e) };
        seedurl_news.each(function (i, e) { //遍历种子页面里所有的a链接
            var myURL = "";
            try {

                // 得到具体新闻url
                var href = "";
                href = $(e).attr("href");
                if (href == undefined) return;
                // 要判断其是http://或https://开头的
                if (href.toLowerCase().indexOf('https://') >= 0 || href.toLowerCase().indexOf('http://') >= 0) myURL = href; 
                else if (href.startsWith('//')) myURL = 'http:' + href; ////开头的
                else myURL = seedURL.substr(0, seedURL.lastIndexOf('/') + 1) + href; //其他

            } catch (e) { console.log('识别种子页面中的新闻链接出错：' + e) }
            
            //检验是否符合新闻url的正则表达式
            console.log("----》当前新闻url")
            console.log(myURL);
            if (!url_reg.test(myURL)) return; 
            console.log("----》筛选后当前新闻url")
            console.log(myURL);

            var fetch_url_Sql = 'select url from fetches where url=?';
            var fetch_url_Sql_Params = [myURL];
            mysql.query(fetch_url_Sql, fetch_url_Sql_Params, function (qerr, vals, fields) {
                // console.log(vals)
                if (!vals) {
                    console.log('vals=NULL')
                }
                else if (vals.length > 0) {
                    console.log('URL duplicate!')
                } else newsGet(myURL); //读取新闻页面
            });
        });
    });
};

function newsGet(myURL) { //读取新闻页面
    request(myURL, function (err, res, body) { //读取新闻页面
        try {
            // res.on('html_news',function(res){
            //     var html_news = myIconv.decode(String(body), 'GBK'); //用iconv转换编码
            // })
            var html_news = myIconv.decode(new Buffer(body), 'UTF-8'); //用iconv转换编码
            // console.log(html_news);
            //准备用cheerio解析html_news
            var $ = myCheerio.load(html_news, { decodeEntities: true });
            myhtml = html_news;
        } catch (e) { 
            console.log('读新闻页面并转码出错：' + e);
            return;
        };

        console.log("转码读取成功:" + myURL);
        //动态执行format字符串，构建json对象准备写入文件或数据库
        var fetch = {};
        fetch.title = "";
        fetch.content = "";
        fetch.publish_date = (new Date()).toFormat("YYYY-MM-DD");
        //fetch.html = myhtml;
        fetch.url = myURL;
        fetch.source_name = source_name;
        fetch.source_encoding = myEncoding; //编码
        fetch.crawltime = new Date();

        if (keywords_format == "") fetch.keywords = source_name; // eval(keywords_format);  //没有关键词就用sourcename
        else fetch.keywords = eval(keywords_format);

        if (title_format == "") fetch.title = ""
        else fetch.title = eval(title_format); //标题
        console.log(fetch.title);
        console.log(date_format);
        if (date_format != "") fetch.publish_date = eval(date_format); //刊登日期   
        console.log('date: ' + fetch.publish_date);
        if (fetch.publish_date) {
            fetch.publish_date = regExp.exec(fetch.publish_date)[0];
            fetch.publish_date = fetch.publish_date.replace('年', '-')
            fetch.publish_date = fetch.publish_date.replace('月', '-')
            fetch.publish_date = fetch.publish_date.replace('日', '')
            fetch.publish_date = new Date(fetch.publish_date).toFormat("YYYY-MM-DD");
        }
        console.log("@@@@@" + $('html#ne_wrap').attr("data-publishtime"));
        if (author_format == "") fetch.author = source_name; //eval(author_format);  //作者
        else fetch.author = eval(author_format);

        if (content_format == "") fetch.content = "";
        else fetch.content = eval(content_format).replace("\r\n" + fetch.author, ""); //内容,是否要去掉作者信息自行决定

        if (source_format == "") fetch.source = fetch.source_name;
        else fetch.source = eval(source_format).replace("\r\n", ""); //来源

        if (desc_format == "") fetch.desc = fetch.title;
        else fetch.desc = eval(desc_format);
        if(fetch.desc) fetch.desc.replace("\r\n", ""); //摘要   

        // console.log("keywords: " + fetch.keywords);
        // console.log("description: " + fetch.desc);;
        console.log("#####content: " + fetch.content);
        
        if (fetch.content) {
            // var filename = source_name + "_" + (new Date()).toFormat("YYYY-MM-DD") +
            //     "_" + myURL.substr(myURL.lastIndexOf('/') + 1) + ".json";
            // ////存储json
            // fs.writeFileSync(filename, JSON.stringify(fetch));

            var fetchAddSql = 'INSERT INTO fetches(url,source_name,source_encoding,title,' +
                'keywords,author,publish_date,crawltime,content) VALUES(?,?,?,?,?,?,?,?,?)';
            var fetchAddSql_Params = [fetch.url, fetch.source_name, fetch.source_encoding,
            fetch.title, fetch.keywords, fetch.author, fetch.publish_date,
            fetch.crawltime.toFormat("YYYY-MM-DD HH24:MI:SS"), fetch.content
            ];

            //执行sql，数据库中fetch表里的url属性是unique的，不会把重复的url内容写入数据库
            mysql.query(fetchAddSql, fetchAddSql_Params, function (qerr, vals, fields) {
                if (qerr) {
                    console.log(qerr);
                    return;
                    // continue;
                    // console.log('qerr\n')

                }
            }); //mysql写入
        } else console.log("404 Not found.");

    });
}