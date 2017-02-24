#!/bin/env node
/*!
**|  scrape.js 
**|    A quick'n'dirty script to fetch HEADs from sites in domains.txt and determine if they are using cloudflare
**|
**@author Xaekai
**@copyright 2017
**@license MIT
*/

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const DOMAINS = 'domains.txt'
const POSITIVE = 'postive.log'
const NEGATIVE = 'negative.log'
const UNCHECKT = 'unchecked.log'

const numWorkers = 4;

class fileWriter{
    constructor(filename){
        this.filename = filename;
        this.writer = fs.createWriteStream(filename, {
            flags: "a",
            encoding: "utf8"
        })
    }

    close(){
        try {
            this.writer.end()
        } catch (e) {
            console.error(`Error: Closing ${this.filename} failed.`);
        }        
    }

    writeEntry(line){
        try {
            this.writer.write(`${line}\n`);
        } catch (e) {
            console.error(`Error: Writing line in ${this.filename} failed.`);
        }        
    }
}

var positive = new fileWriter(path.join(path.resolve(process.cwd()), POSITIVE));
var negative = new fileWriter(path.join(path.resolve(process.cwd()), NEGATIVE));
var uncheckt = new fileWriter(path.join(path.resolve(process.cwd()), UNCHECKT));

function scrapeWorker(){
    function onFinish(){
        if(domains.length){
            return process.nextTick(scrapeWorker); 
        } else { return console.info('Worker finished.') }
    }

    function onProblem() {
        if (issue > 0) return; issue++;
        uncheckt.writeEntry(domain);
        onFinish();
    }

    if(!domains.length){ return console.info('Worker finished.') }
    let domain = domains.shift();
    let issue = 0;

    // Blank line
    if(!domain.length){
        return process.nextTick(scrapeWorker);
    }

    console.info(`Checking ${domain}`)

    https.request({
        method: 'HEAD',
        path: '/',
        host: domain
    }, (res)=>{
        if(res.headers["cf-ray"] || res.headers["server"] === 'cloudflare-nginx'){
            console.info(`${domain} is using Cloudflare`)
            positive.writeEntry(domain)
        } else {
            console.info(`${domain} is not using Cloudflare`)
            negative.writeEntry(domain)
        }

        return onFinish();
    })
    .setTimeout(6000, ()=>{
        console.error(`Error: ${domain} took too long to respond`);
        onProblem();
    })
    .on('error', (err)=>{
        console.error(`Error: Unable to check ${domain}`);
        onProblem();
    })
    .end();
}

var domains = [];

console.log('Reading file');
readline.createInterface({
    input: fs.createReadStream(path.join(path.resolve(process.cwd()), DOMAINS)).on('error', ()=>{
        console.error('Fatal Error: Unable to read input file');
        process.exit(1);
    })
}).on('line', (line) => {
    //console.info(line)
    domains.push(line.trim());
}).on('close', () => {
    for (var i = 0; i < numWorkers; i++) {
        console.info(`Starting worker ${i}`);
        process.nextTick(scrapeWorker);
    }

    // Once we start, respond to SIGUSR2 to state how many domains are left
    process.on('SIGUSR2', ()=>{
        const ColorRed = '\x1b[31m';
        const ColorReset = '\x1b[0m';
        console.log(`${ColorRed} There are ${domains.length} left to check ${ColorReset}`);
    });

});

