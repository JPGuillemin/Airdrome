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
   * @param {number} [bitRate] Preferred bitrate in kbps (1000 = original).
   * @returns {string}
   */
  getStreamUrl: function(id, bitRate) {
    var server = this.auth.server
    var urlParams = this.auth.urlParams
    var quality = Number(bitRate)
    var audioCodec = localStorage.getItem('audioCodec') || 'mp3'

    if (!Number.isFinite(quality) || quality <= 0) {
      quality = 128
    }

    if (quality === 1000) {
      audioCodec = 'raw'
      quality = 0
    }

    return server + '/rest/stream' +
      '?id=' + id +
      '&v=1.16.1' +
      '&' + urlParams +
      '&maxBitRate=' + quality +
      '&format=' + audioCodec +
      '&c=' + this.clientName
  }
}
