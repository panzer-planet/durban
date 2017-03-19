const blessed = require('blessed')
const EventEmitter = require('events')

var eventEmitter = new EventEmitter()

var _parent = null
var _log = null
var _blessedList = null
var _directMessages = []

class DirectMessageList {

  constructor(parent, log, emitter) {
    _parent = parent
    _log = log
    _blessedList = blessed.list({
      parent: parent,
      // scrollable: true,
      keys: true,
      label: 'DIRECT MESSAGES',
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

    _blessedList.on('select', function(data) {
      emitter.emit('directMessageListSelect', data.getText())
    })

    _blessedList.on('cancel', function() {
      emitter.emit('directMessageListCancel')
    })

  }

  getBlessedList() {
    return _blessedList
  }

  on(eventName, callback) {
    _blessedList.on(eventName, callback)
  }

  add(id, userId, username) {
    _directMessages.push({ id: id, userId: userId, username: username })
    _blessedList.addItem(username)
  }

  updateBlessed() {
    _directMessages.forEach(message => {
      _blessedList.addItem(message.username)
    })
  }


}

module.exports = DirectMessageList