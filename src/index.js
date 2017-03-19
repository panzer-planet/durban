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
const blessedContrib = require('blessed-contrib')
const slack = require('slack')
const DirectMessageList = require('./DirectMessageList')

// Slack Client
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
var SlackRtmClient = null // Slack WS Client

/*
  rtms contains all info for the team connected to
  {
    "ok":true,
    "self":{},
    "team":{},
    "latest_event_ts":"1489887716.000000",
    "channels":[],
    "groups":[],
    "ims":[],
    "cache_ts":1489888316,
    "read_only_channels":[],
    "can_manage_shared_channels":false,
    "subteams":{},
    "dnd":{},
    "users":[],
    "cache_version":"v16-giraffe",
    "cache_ts_version":"v2-bunny",
    "bots":[],
    "url":"wss://mpmulti-1zsn.slack-msgs.com/websocket/klWpfVglg2BOCjvkSR..........."
  }
  */
var rtmsStartData = null

// STATE DATA
var state = {
  userId: null,
  chatContents: null,
  activeChat: null,
  channels: [],
  users: [],
  ims: []
}

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

const durban = {
  directMessageList: null,
  channelList: null,
}

/*
 * ===========================
 *            GUI
 * ===========================
 */
function initBlessed(callback) {
  gui.screen = blessed.screen({
    smartCSR: true,
    autoPadding: true,
    dockBorders: true
  })

  gui.screen.title = PACKAGE_NAME

  gui.screen.key(['C-c'], function(ch, key) {
    shut_down()
  })

  callback()
}

function initGUI(callback) {

  // DirectMessageList.init(gui.screen, 'DIRECT MESSAGE')
  durban.directMessageList = new DirectMessageList(gui.screen, log)

  gui.chatBox = blessed.log({
    parent: gui.screen,
    scrollable: true,
    scrollOnInput: true,
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
  // gui.messageList.on('cancel', function() {
  //   log('messageList:cancel')
  //   gui.inputBox.focus()
  // })

  // gui.messageList.on('select', function(data) {
  //   log('messageList:select')
  //   const text = data.getText()
  //   log(`Switching to chat: ${text}`)
  //   state.activeChat = text
  //   slack.im.history({ token: SLACK_API_TOKEN, channel: text }, function(err, data) {
  //     if(err) {
  //       log(err)
  //       throw err
  //     } else {
  //       log('%%%%%%%%' + JSON.stringify(data))
  //       gui.chatBox.setText('')
  //       if(data.messages.length > 0) {
  //         gui.chatBox.setText(data.messages.reverse().reduce((p, c) => {
  //           return `${p}\n${c.user}: ${c.text}` // p + "\n " + c.text // backwards
  //         }))
  //       }
  //     }
  //   })

  //   // gui.chatBox.set
  //   gui.chatBox.setLabel(text)
  //   gui.screen.render()
  //   gui.inputBox.focus()
  // })

  gui.screen.render()

  // Channel message box
  callback()
}

/*
 * ===========================
 *            SLACK
 * ===========================
 */
function initSlackClient(callback) {

  slack.rtm.start({ token: SLACK_API_TOKEN }, function(err, data) {
    if (err) {
      log(err)
    } else {
      rtmsStartData = data
      state.userId = data.self.id
      state.channels = data.channels
      state.users = data.users

      // just to see
      state.ims = data.ims.map(item => {
        const no = {
          id: item.id,
          user: item.user
        }
        log('IM ITEM ' + JSON.stringify(no))
        log('IM ITEM ' + JSON.stringify(item))

        return item
      })
      state.activeChat = data.ims[0].id   // temporary

      // Populate PM list
      // gui.messageList.setItems(data.ims.map(im => im.id))
      data.ims.forEach(item => {
        durban.directMessageList.add(item.id, item.userId, 'boo')
      })
      gui.screen.render()
    }
  })

  //     === RTM CLIENT ===

  SlackRtmClient = slack.rtm.client()

  // Connected
  SlackRtmClient.hello(_message => {
    log("Connected to Slack RTM server")
  })

  // Disconnected
  SlackRtmClient.goodbye(_message => {
    log("Disconnected from Slack RTM server")
  })

  // Message received
  SlackRtmClient.message(message => {
    log(`Got a message`)
    // log(JSON.stringify(message))
    gui.chatBox.pushLine(`${message.user}: ${message.text}`)
  })

  SlackRtmClient.listen({ token: SLACK_API_TOKEN })

  callback()
}

function nameToId(name) {
  const user = state.users.find(user => user.name === name)
  if(user) {
    return user.id
  } else {
    throw "no such name"
  }
}

function userIdToName(id) {
  const user = state.users.find(user => user.id === id )
  if(user) {
    return user.name
  } else {
    throw "No such user id"
  }
}

function iMMessageIdToUserId(messageId) {
  // we want a full user object
  // we have to look in ims
  const im = state.ims.find(im => messageId === im.id)
  return im.user
}

function userIdToIMMessageId(userId) {
  const im = state.ims.find(im => userId === im.user)
  if(im) return im.id
  else throw "could not find an IM from that user"
}

/*
 * ===========================
 *            SYSTEM
 * ===========================
 */

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

function log(text) {
  write_streams.log.write(moment().format() + ": " + text + "\n")
}

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
            log('POST INIT')
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

function shut_down() {
  log('Durban is going down...')
  log('Closing Slack clients')
  SlackRtmClient.close()

  log('Cleaning up blessed')
  blessedProgram.clear()
  blessedProgram.disableMouse()
  blessedProgram.showCursor()
  blessedProgram.normalBuffer()

  log('Closing file streams')

  // Finish loggin before closing streams
  setTimeout(function() {
    write_streams.log.end()
    write_streams.user_config.end()
    return process.exit(0)
  }, 100)
}

// Run the app
boot((err) => {
  if(err) {
    throw err
  } else {
    // ready and waiting
    log("startup complete")


    // Let's being
    gui.inputBox.focus()
    gui.screen.render()
  }
})
