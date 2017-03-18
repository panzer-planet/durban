'use strict'

/**
 * ██████╗ ██╗   ██╗██████╗ ██████╗  █████╗ ███╗   ██╗
 * ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔══██╗████╗  ██║
 * ██║  ██║██║   ██║██████╔╝██████╔╝███████║██╔██╗ ██║
 * ██║  ██║██║   ██║██╔══██╗██╔══██╗██╔══██║██║╚██╗██║
 * ██████╔╝╚██████╔╝██║  ██║██████╔╝██║  ██║██║ ╚████║
 * ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝
 * @author Werner Roets <werner@io.co.za>
 * @author Ant Cosentino <ant@io.co.za>
 * @license MIT
 */

const CWD = process.cwd()
const ARGV = require('minimist')(process.argv.slice(2))
const DEV = ARGV.dev || false

// IMPORTS
const fs = require('fs')
const os = require('os')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const SlackWebClient = require('@slack/client').WebClient
const moment = require('moment')

// CONSTANTS
const PACKAGE_NAME = require(CWD + '/package.json').name
const VERSION = require(CWD + "/package.json").version

const USER_FOLDER = DEV ? CWD + "/." + PACKAGE_NAME
                        : process.env.WORKING_TITLE_USER_FOLDER
                        || os.homedir() + "/." + PACKAGE_NAME

const LOG_FILE = DEV ? CWD + "/." + PACKAGE_NAME + "/log.txt"
                     : USER_FOLDER + "/log.txt"

const USER_CONFIG_FILE = DEV ? CWD + '/.' + PACKAGE_NAME + '/config.json'
                             : USER_FOLDER + "/config.json"

const SLACK_API_TOKEN = DEV ? require(CWD + "/slack_dev_token.json")
                            : process.env.SLACK_API_TOKEN

// SLACK GLOBALS
var swc = null
var channels= []
// BLESSED GLOBALS

const blessedProgram = blessed.program()
var gui = {
  screen: null,
  messageList: null,
  chatBox: null,
  form: null,
  textBox: null
}

// DURBAN GLOBALS
var write_streams = {
  log: null,
  user_config: null
}

function initLog(callback) {
  const startDemarcation  = "######################################"
  const startTime = moment().format()
  fs.access(USER_FOLDER, fs.constants.F_OK, err => {
    if(err) {
      fs.mkdir(USER_FOLDER, err => {
        if(err) {
          throw err
        } else {
          fs.writeFile(LOG_FILE, startDemarcation + PACKAGE_NAME + " log " + moment().format() + "\n", err => {
            if(err) {
              throw err
            } else {
              write_streams.log = fs.createWriteStream(LOG_FILE)
              callback()
            }
          })
        }
      })
    } else {
      fs.writeFile(LOG_FILE, `\n${startDemarcation}\n${PACKAGE_NAME} log ${startTime} \n`, err => {
        if(err) {
          throw err
        } else {
          write_streams.log = fs.createWriteStream(LOG_FILE)
          callback()
        }
      })
    }
  })
}

/**
 * Initialise the user config file
 */
function initUserConfig(callback) {
  fs.access(USER_FOLDER, fs.constants.F_OK, err => {
    if(err) {
      fs.mkdir(USER_FOLDER, err => {
        if(err) {
          throw err
        } else {
          fs.writeFile(USER_FOLDER + "/config.json", "{}", err => {
            if(err) {
              throw err
            } else {
              write_streams.user_config = fs.createWriteStream(USER_FOLDER + "/config.json")
              callback()
            }
          })
        }
      })
    } else {
      fs.writeFile(USER_FOLDER + "/config.json", "{}", err => {
        if(err) {
          throw err
        } else {
          write_streams.user_config = fs.createWriteStream(USER_FOLDER + "/config.json")
          callback()
        }
      })
    }
  })
}


function initBlessed(callback) {
  gui.screen = blessed.screen({
    smartCSR: true,
    autoPadding: true,
  })

  gui.screen.title = PACKAGE_NAME

  gui.screen.key(['C-c'], function(ch, key) {
    shut_down()
  })

  callback()
}

function initGUI(callback) {

  gui.messageList = blessed.list({
    parent: gui.screen,
    // scrollable: true,
    keys: true,
    fg: 'green',
    width: '15%',
    height: '80%',
    valign: 'bottom',
    left: 0,
    top: 0,
    tags: true,
    border: {
      type: 'line',
      fg: 'white'
    }
  })

  gui.chatBox = blessed.log({
    parent: gui.screen,
    scrollable: true,
    alwaysScroll: true,
    // fg: 'green',
    width: '85%',
    height: '80%',
    valign: 'bottom',
    right: 0,
    top: 0,
    tags: true,
    border: {
      type: 'line',
      fg: 'white'
    }
  })


  // Message input form
  gui.inputBox = blessed.textbox({
    parent: gui.screen,
    scrollable: true,
    inputOnFocus: true,
    keys: true,
    bottom: 0,
    width: '100%',
    height: '20%',
    border: {
      type: 'line',
      fg: 'yellow'
    }
  })

  // Input

  gui.screen.key(['C-k'], function(ch, key) {
    gui.inputBox.focus()
  })
  // InputBox
  gui.inputBox.on('submit', function(data) {
    log('inputBox:submit')
    gui.chatBox.pushLine(data.toString())
    gui.inputBox.clearValue()
    gui.screen.render()
    gui.inputBox.focus()
  })
  gui.inputBox.on('cancel', function(data) {
    log('inputBox:cancel')
  })

  // Message list
  gui.messageList.on('cancel', function() {
    log('messageList:cancel')
    gui.inputBox.focus()
  })
  gui.messageList.on('select', function(data) {
    log('messageList:select')
    // log(JSON.stringify(data))
    gui.inputBox.focus()
  })

  gui.screen.render()

  // Channel message box
  callback()
}

function initSlackClient(callback) {
  swc = new SlackWebClient(SLACK_API_TOKEN)
  log('Getting channel list')
  swc.channels.list(function(err, info) {
    if (err) {
      callback(err)
    } else {
      log("Channel list populated")
      channels = info.channels
      callback()
    }
  })
}

function log(text) {
  write_streams.log.write(moment().format() + ": " + text + "\n")
}

/**
 * Initialise
 */
function boot(callback) {
  blessedProgram.clear();
  blessedProgram.write(PACKAGE_NAME + " is starting up...")
  initLog(() => {
    log("Log initialised at " + LOG_FILE)
    log(PACKAGE_NAME + " is booting...")
    initBlessed(() => {
      // show splash
      log("blessed initialised")
      initUserConfig(() => {
        log("loaded " + USER_CONFIG_FILE)
        initGUI(() => {
          gui.screen.render()
          log("GUI initialised")
          initSlackClient((err) => {

            if(err) {
              log("Could not init slack client " + err.message)
              if(err.message === 'token_revoked') {
                // Tell the user
                  gui.dialog = blessed.message({
                    parent: gui.screen,
                    width: '100%',
                    height: '20%',
                    valign: 'middle',
                    border: {
                      type: 'line',
                      fg: '#ff9200'
                    },
                    style: {
                      hover: {
                        bg: 'red'
                      },
                      transparent: true,
                      invisible: true
                    }
                  })
                gui.dialog.error("FATAL ERROR: Invalid slack token. Please check your SLACK_API_TOKEN environment variable.", () => {
                  shut_down()
                })
              } else if(err.message === 'invalid_auth') {
                // invalid auth token
              } else {
                // unknown error
              }
            } else {
              log("Slack client initialised")

              // after boot
              callback()
            }
          })
        })
      })
    })
  })
}

/**
 * Bring down safely
 */
function shut_down() {
  blessedProgram.clear();
  blessedProgram.disableMouse();
  blessedProgram.showCursor();
  blessedProgram.normalBuffer();
  write_streams.log.end()
  write_streams.user_config.end()
  return process.exit(0)
}


boot((err) => {
  if(err) {
    throw err
  } else {
    log("startup complete")

    // ready and waiting
    swc.users.list(function(err, info) {
      // log(JSON.stringify(info))
      if (err) {
        log('Error:', err);
      } else {
        for(var i in info.members) {
          gui.messageList.addItem(info.members[i].name)
        }
        gui.inputBox.focus()
        gui.screen.render()

      }
    })
  }
})
