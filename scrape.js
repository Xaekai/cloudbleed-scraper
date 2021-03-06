#!/bin/env node
/*!
**|  scrape.js 
**|    A quick'n'dirty script to fetch HEADs from sites in domains.txt and determine if they are using Cloudflare
**|
**@author Xaekai
**@license MIT
**@copyright 2017
*/

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const DOMAINS = process.env.SCRAPEFILE || 'domains.txt';
const POSITIVE = 'postive.log';
const NEGATIVE = 'negative.log';
const UNCHECKT = 'unchecked.log';

const numWorkers = 8;

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

function scrapeWorker(){
    function onFinish(){
        if(finished){ return } finished = true;
        if(domains.length){
            return process.nextTick(scrapeWorker); 
        } else { 
            console.info('Worker finished.');
            return finish();
        }
    }

    function onProblem() {
        if (issue > 0){ return } issue++;
        uncheckt.writeEntry(domain);
        return onFinish();
    }

    if(!domains.length){ 
        return onFinish();
    }
    let domain = domains.shift();
    let issue = 0; let finished = false;

    // Blank line
    if(!domain.length){
        return onFinish();
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

function finish(){
    workersDone++;
    if(workersDone == numWorkers){
        console.log('Complete');
        cleanup();
        process.exit(0);
    }

}

function cleanup(){
    positive.close();
    negative.close();
    uncheckt.close();
}

var positive = new fileWriter(path.join(path.resolve(process.cwd()), POSITIVE));
var negative = new fileWriter(path.join(path.resolve(process.cwd()), NEGATIVE));
var uncheckt = new fileWriter(path.join(path.resolve(process.cwd()), UNCHECKT));

var domains = [];
var workersDone = 0;

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

    process.on('SIGINT', ()=>{
        cleanup();
        process.exit(1);
    });
});

