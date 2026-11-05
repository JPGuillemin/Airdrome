// shared/api/urls.js
//
// URL builders for media endpoints. Written in an explicit, ES5-friendly
// style: var and function expressions.

export var urlMethods = {
  /**
   * @param {string} id
   * @returns {string}
   */
  getDownloadUrl: function(id) {
    var server = this.auth.server
    var urlParams = this.auth.urlParams

    return server + '/rest/download' +
      '?id=' + id +
      '&v=1.16.1' +
      '&' + urlParams +
      '&c=' + this.clientName
  },

  /**
   * @param {Object} item
   * @returns {string|undefined}
   */
  getCoverArtUrl: function(item) {
    if (!item.coverArt) {
      return undefined
    }

    var server = this.auth.server
    var urlParams = this.auth.urlParams

    return server + '/rest/getCoverArt' +
      '?id=' + item.coverArt +
      '&v=1.16.1' +
      '&' + urlParams +
      '&c=' + this.clientName +
      '&size=300'
  },

  /**
   * @param {string} id
   * @returns {string}
   */
  getStreamUrl: function(id) {
    var server = this.auth.server
    var urlParams = this.auth.urlParams
    var storedQuality = Number(localStorage.getItem('streamQuality'))
    var bitRate = 128
    var audioCodec = localStorage.getItem('audioCodec') || 'mp3'

    if (Number.isFinite(storedQuality) && storedQuality > 0) {
      bitRate = storedQuality
    }

    if (bitRate === 1000) {
      audioCodec = 'raw'
      bitRate = 0
    }

    return server + '/rest/stream' +
      '?id=' + id +
      '&v=1.16.1' +
      '&' + urlParams +
      '&maxBitRate=' + bitRate +
      '&format=' + audioCodec +
      '&c=' + this.clientName
  }
}
