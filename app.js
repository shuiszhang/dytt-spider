#!/usr/bin/env node

let cheerio = require('cheerio');
let request = require('superagent-charset')(require('superagent'));
let async = require("async");
let url = require('url');
let mongodb = require('mongodb');

//入口
const routes = [
  'http://www.ygdy8.net/html/gndy/china/index.html', //国内电影
  'http://www.ygdy8.net/html/gndy/rihan/index.html', //日韩
  'http://www.ygdy8.net/html/gndy/oumei/index.html', //欧美
  'http://www.ygdy8.net/html/gndy/jddy/index.html', //综合电影
  'http://www.ygdy8.net/html/gndy/dyzz/index.html', //最新电影
];

const host = 'http://www.ygdy8.net';

//获取入口包含的所有分页url
let getPageUrl = async (route_url) => {
  let res = await request.get(route_url);
  let arr = [];
  let $ = cheerio.load(res.text);
  $('select[name=sldd]').children('option').each((i, item) => {
    arr.push(url.resolve(route_url, $(item).val()))
  });
  return arr;
};

//获取页面上的所有电影页面url
let getMovieUrl = async (page_url) => {
  let res = await request.get(page_url);
  let arr = [];
  let $ = cheerio.load(res.text);
  $('.tbspan').each((i, item) => {
    arr.push(host + $(item).find('.ulink')[1].attribs.href)
  });
  return arr;
};

//获取电影页面上所有的电影信息 [{title: 'xxx', url: 'yyy'},...]
let getMovieInfo = async (movie_url) => {
  let res = await request.get(movie_url).charset('gbk');
  let info = {};
  let $ = cheerio.load(res.text);
  info.title = $('.bd3r .title_all font').text();
  info.url = $('td[style="WORD-WRAP: break-word"] a')[0].attribs.href;

  let reg = /.*\/(.*)\.html/;
  let arr = reg.exec(movie_url);
  if (arr) {
    info.dy_id = arr[1];
  }
  return info;
};

//获取每一页所有电影的信息,返回array
let task = async (page_url, cb) => {
  let arr = await getMovieUrl(page_url);

  let movies = [];
  for (let item of arr) {
    let info = await getMovieInfo(item);
    //console.log('task:', info);
    movies.push(info);
  }
  cb(movies);
};

let queue = (page_urls, cb) => {
  let q = async.queue((page_url, cb) => {
    task(page_url, cb);
  }, 5);

  q.drain = () => {
    console.log('finish');
  };

  q.push(page_urls, function (data) {
    console.log('data:', data);
    cb(data);
  });
};

let insert = (collection) => (data) => {
  collection.insert(data);
};

let run = async () => {
  let page_urls = [];
  for (let item of routes) {
    let tmp = await getPageUrl(item);
    page_urls = page_urls.concat(tmp);
  }

  //初始化mongodb
  let server  = new mongodb.Server('localhost', 27017, {auto_reconnect:true});
  let mongo = new mongodb.Db('dytt', server, {safe:true});
  async.waterfall([
    function (cb) {
      mongo.open(function (err, db) {
        cb(err, db);
      });
    },
    function (db, cb) {
      db.collection('movie', function (err, collection) {
        cb(err, collection);
      });
    },
    function (collection, cb) {
      queue(page_urls, insert(collection));
    }
  ], function (err) {
    mongo.close();
  })
};

let text = run();
