const blessed = require('blessed')

var _parent = null
var _log = null
var _blessedList = null
var _directMessages = []

class DirectMessageList {

  constructor(parent, log) {
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