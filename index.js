console.clear()

const prompt = require('prompt-sync')()
const { exit } = require('process')

process.on('uncaughtException', function (err) {
    console.log('')
    console.log(err)
    console.log('')
    appExit()
})

const path = require('path')
const fs = require('fs')
const cliProgress = require('cli-progress')
const _colors = require('ansi-colors')
// const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
// const ffprobePath = require('@ffprobe-installer/ffprobe').path
const ffmpeg = require('fluent-ffmpeg')
// ffmpeg.setFfmpegPath(ffmpegPath)
// ffmpeg.setFfprobePath(ffprobePath)
const package = require('./package.json')

console.log('--------------------------------------')
console.log(
    '  ',
    _colors.greenBright('Node'),
    _colors.redBright('Canvas'),
    _colors.blueBright('Generator'),
    '[ver. ' + package.version + ']'
)
console.log('--------------------------------------')
console.log('')

const inputFolder = 'input'
const outputFolder = 'output'
if (!fs.existsSync(inputFolder)) {
    fs.mkdirSync(inputFolder);
	console.log('input folder created.')
	separateContext()
}
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
}

/*
console.log('Cleaning files in', outputFolder, 'folder...')
let files = fs.readdirSync(outputFolder)
files.forEach(file => {
    fs.unlinkSync(path.join(outputFolder, file))
})
*/

console.log('Scanning files in', inputFolder, 'folder...')
files = fs.readdirSync(inputFolder)

separateContext()

if (files.length == 0) {
	console.log('0 files found in input folder.')
	console.log('Please put one or more files in it.')
	appExit()
}

console.log('Found these files:')
files.forEach((f, i) => {
    console.log(i, '=>', f)
})
console.log('')
globalInputFile = prompt('Which file should we use to make a canvas?')
console.log(files[globalInputFile], 'will be the file')
globalInputFileName = files[globalInputFile]
globalInputFile = path.join(inputFolder, files[globalInputFile])
console.log('')

asyncProcess()
async function asyncProcess() {
    await checkInputFile()

    const SAFETY_MARGIN = 0.1 // ≈ 2 frames
    const DEFAULT_START = 0
    const MIN_START = 0
    const MIN_DURATION = 3 + SAFETY_MARGIN
    const MAX_DURATION = 8 - SAFETY_MARGIN

    globalStart = prompt('time start? (default = ' + DEFAULT_START + ', max = ' + (globalInputDuration - MIN_DURATION) + ') ')
    globalStart = filterNumberInput(globalStart, MIN_START, globalInputDuration - MIN_DURATION, DEFAULT_START)
    console.log('time start =', toHHMMSS(globalStart))

    let maxDuration = Math.min(globalInputDuration - globalStart, MAX_DURATION)
    let defaultDuration = maxDuration
    globalDuration = prompt('duration? (default = max = ' + maxDuration + ') ')
    globalDuration = filterNumberInput(globalDuration, MIN_DURATION, maxDuration, defaultDuration)
    console.log('time end =', toHHMMSS(globalStart + globalDuration))

    separateContext()

    calculateCroppingParameters()
    await createVerticalVideo()
    appExit()
}


function checkInputFile() {
    return new Promise((resolve, reject) => {
        ffmpeg(globalInputFile).ffprobe((err, data) => {
            data.streams.forEach((s, i) => {
                if (s.codec_type == 'video') {
                    globalInputWidth = s.width
                    globalInputHeight = s.height
                    globalInputDuration = Math.floor(s.duration)
                    resolve(i)
                }
            })
            reject(_colors.redBright('\r\n\r\nERROR: SELECTED FILE IS NOT A VIDEO!!!\r\n\r\n'))
        })
    })
}

function calculateCroppingParameters() {
    let w = globalInputHeight * 9 / 16
    let h = globalInputHeight
    if (globalInputWidth < (globalInputHeight * 9 / 16)) {
        w = globalInputWidth
        h = globalInputWidth * 16 / 9
    }
    let sx = (globalInputWidth / 2) - (w / 2)
    let sy = (globalInputHeight / 2) - (h / 2)
    globalCropping = [w, h, sx, sy].map(x => Math.floor(x)).join(":")
}

function createVerticalVideo() {
    return new Promise((resolve) => {
        let progressBar = false
        let updateTime = Date.now()
        ffmpeg()
            .input(globalInputFile)
            .fps(25)
            .inputOptions('-ss ' + toHHMMSS(globalStart))
            .inputOptions('-to ' + toHHMMSS(globalStart + globalDuration))
            .videoFilters('crop=' + globalCropping)
            .videoFilters('scale=612:1088')
            .videoCodec('libx264')
            .saveToFile(path.join(outputFolder, globalInputFileName + '_' + fileDate() + '.mp4'))
            .on('start', (command) => {
                console.log(_colors.greenBright('FFmpeg invoked with command:'))
                console.log(command)
            })
            .on('codecData', data => {
                progressBar = new cliProgress.Bar({
                    format:
                        _colors.redBright('{bar} {percentage} %') + ' | ' +
                        _colors.greenBright('ETA: {eta} s') + ' | ' +
                        _colors.blueBright('{value} / {total} s')
                    ,
                    barCompleteChar: '\u2588',
                    barIncompleteChar: '\u2591',
                    hideCursor: true
                })
                let total = tsToSec(data.duration)
                progressBar.start(total, 0)
                globalTotal = total
            })
            .on('progress', data => {
                if ((Date.now() - updateTime > 500)) {
                    progressBar.update(tsToSec(data.timemark))
                    updateTime = Date.now()
                }
            })
            .on('end', () => {
                progressBar.update(globalTotal)
                progressBar.stop()
                resolve()
            })
    })
}

function filterNumberInput(input, min, max, defaultValue, mustBeInt = false) {
    if (input == '')
        return defaultValue
    let n = Number(input)
    if (isNaN(n))
        return defaultValue
    if (mustBeInt)
        n = Math.floor(n)
    if (n < min)
        return min
    if (n > max)
        return max
    return n
}

function toHHMMSS(secs) {
    var sec_num = parseInt(secs, 10)
    var hours = Math.floor(sec_num / 3600)
    var minutes = Math.floor(sec_num / 60) % 60
    var seconds = sec_num % 60

    let p1 = [hours, minutes, seconds]
        .map(v => v < 10 ? "0" + v : v)
        .join(":")

    let p2 = parseFloat(Number(secs) - sec_num).toFixed(4)
    p2.split('.')[1]

    return [p1, p2.split('.')[1]].join('.')
}

function tsToSec(ts) {
    // 12:34:56.78 -> 45296.78 s
    let arr = ts.split(':').map(x => Number(x))
    let result = arr[0] * 60 * 60
    result += arr[1] * 60
    result += arr[2]
    result = Number(result.toFixed(2))
    return result
}

function appExit() {
    console.log('')
    prompt('We have finished. Please press enter or close this window.')
    exit()
}

function separateContext() {
    console.log('')
    console.log('---')
    console.log('')
}

function fileDate() {
    return (new Date).toLocaleString().replaceAll('/', '-').replaceAll(', ', '_').replaceAll(':', '-')
}