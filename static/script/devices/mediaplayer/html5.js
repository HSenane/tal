/**
 * @fileOverview Requirejs module containing device modifier to launch native external media players
 *
 * @preserve Copyright (c) 2014 British Broadcasting Corporation
 * (http://www.bbc.co.uk) and TAL Contributors (1)
 *
 * (1) TAL Contributors are listed in the AUTHORS file and at
 *     https://github.com/fmtvp/TAL/AUTHORS - please extend this file,
 *     not this notice.
 *
 * @license Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * All rights reserved
 * Please contact us for an alternative licence
 */

require.def(
    "antie/devices/mediaplayer/html5",
    [
        "antie/runtimecontext",
        "antie/devices/device",
        "antie/devices/mediaplayer/mediaplayer"
    ],
    function(RuntimeContext, Device, MediaPlayer) {
        "use strict";

        var Player = MediaPlayer.extend({

            init: function() {
                this._super();
                this._state = MediaPlayer.STATE.EMPTY;
                this._wipe();
            },


            /**
            * @inheritDoc
            */
            setSource: function (mediaType, url, mimeType) {
                if (this.getState() === MediaPlayer.STATE.EMPTY) {
                    this._type = mediaType;
                    this._source = url;
                    this._mimeType = mimeType;
                    var device = RuntimeContext.getDevice();

                    var idSuffix = mediaType === MediaPlayer.TYPE.AUDIO ? "Audio" : "Video";

                    this._mediaElement = device._createElement(this._type, "mediaPlayer" + idSuffix);
                    this._mediaElement.autoplay = false;
                    this._mediaElement.style.position = "absolute";
                    this._mediaElement.style.top = "0px";
                    this._mediaElement.style.left = "0px";
                    this._mediaElement.style.width = "100%";
                    this._mediaElement.style.height = "100%";

                    var self = this;
                    this._wrapOnFinishedBuffering = function (event) { self._onFinishedBuffering(event); };
                    this._wrapOnMediaError = function (event) { self._onMediaError(event); };
                    this._wrapOnEndOfMedia = function (event) { self._onEndOfMedia(event); };
                    this._wrapOnDeviceBuffering = function (event) { self._onDeviceBuffering(event); };
                    this._wrapOnStatus = function (event) { self._onStatus(event); };
                    this._wrapOnMetadata = function (event) { self._onMetadata(event); };
                    this._wrapOnPlaying = function (event) { self._onPlaying(event); };
                    this._mediaElement.addEventListener("canplaythrough", this._wrapOnFinishedBuffering);
                    this._mediaElement.addEventListener("error", this._wrapOnMediaError);
                    this._mediaElement.addEventListener("ended", this._wrapOnEndOfMedia);
                    this._mediaElement.addEventListener("waiting", this._wrapOnDeviceBuffering);
                    this._mediaElement.addEventListener("timeupdate", this._wrapOnStatus);
                    this._mediaElement.addEventListener("loadedmetadata", this._wrapOnMetadata);
                    this._mediaElement.addEventListener("playing", this._wrapOnPlaying);

                    var body = document.getElementsByTagName("body")[0];
                    device.prependChildElement(body, this._mediaElement);

                    var source = device._createElement("source");
                    source.src = url;
                    source.type = mimeType;
                    source.addEventListener("error", function (event) { self._onSourceError(event); });
                    device.appendChildElement(this._mediaElement, source);

                    this._mediaElement.preload = "auto";
                    this._mediaElement.load();

                    this._toStopped();
                } else {
                    this._toError("Cannot set source unless in the '" + MediaPlayer.STATE.EMPTY + "' state");
                }
            },
            
            /**
            * @inheritDoc
            */
            playFrom: function (time) {
                this._postBufferingState = MediaPlayer.STATE.PLAYING;
                switch (this.getState()) {
                    case MediaPlayer.STATE.STOPPED:
                        this._targetSeekTime = time;
                        this._toBuffering();
                        break;

                    case MediaPlayer.STATE.BUFFERING:
                        if (this._waitingToSeek()) {
                            this._targetSeekTime = time;
                        } else {
                            this._seekTo(time);
                            this._playIfNotAtEndOfMedia();
                        }
                        break;

                    case MediaPlayer.STATE.PLAYING:
                        if (this._mediaElement.currentTime === this._getClampedTime(time)) {
                            this._toBuffering();
                            this._toPlaying();
                        } else {
                            this._seekTo(time);
                            this._playIfNotAtEndOfMedia();
                            this._toBuffering();
                        }
                        break;


                    case MediaPlayer.STATE.PAUSED:
                        this._seekTo(time);
                        this._playIfNotAtEndOfMedia();
                        this._toBuffering();
                        break;

                    case MediaPlayer.STATE.COMPLETE:
                        if (this._mediaElement.currentTime === this._getClampedTime(time)) {
                            this._toBuffering();
                            this._toComplete();
                        } else {
                            this._seekTo(time);
                            this._playIfNotAtEndOfMedia();
                            this._toBuffering();
                        }
                        break;

                    default:
                        this._toError("Cannot playFrom while in the '" + this.getState() + "' state");
                        break;
                }
            },

            /**
            * @inheritDoc
            */
            pause: function () {
                this._postBufferingState = MediaPlayer.STATE.PAUSED;
                switch (this.getState()) {
                    case MediaPlayer.STATE.PAUSED:
                        break;

                    case MediaPlayer.STATE.BUFFERING:
                        if (!this._waitingToSeek()) {
                            this._mediaElement.pause();
                        }
                        break;

                    case MediaPlayer.STATE.PLAYING:
                        this._mediaElement.pause();
                        this._toPaused();
                        break;

                    default:
                        this._toError("Cannot pause while in the '" + this.getState() + "' state");
                        break;
                }
            },

            /**
            * @inheritDoc
            */
            resume : function () {
                this._postBufferingState = MediaPlayer.STATE.PLAYING;
                switch (this.getState()) {
                    case MediaPlayer.STATE.PLAYING:
                    case MediaPlayer.STATE.BUFFERING:
                        break;                    

                    case MediaPlayer.STATE.PAUSED:
                        this._mediaElement.play();
                        this._toPlaying();
                        break;

                    default:
                        this._toError("Cannot resume while in the '" + this.getState() + "' state");
                        break;
                }
            },

            /**
            * @inheritDoc
            */
            stop: function () {
                switch (this.getState()) {
                    case MediaPlayer.STATE.BUFFERING:
                    case MediaPlayer.STATE.PLAYING:
                    case MediaPlayer.STATE.PAUSED:
                    case MediaPlayer.STATE.COMPLETE:
                        this._mediaElement.pause();
                        this._toStopped();
                        break;

                    default:
                        this._toError("Cannot stop while in the '" + this.getState() + "' state");
                        break;
                }
            },

            /**
            * @inheritDoc
            */
            reset: function () {
                switch (this.getState()) {
                    case MediaPlayer.STATE.STOPPED:
                    case MediaPlayer.STATE.ERROR:
                        this._toEmpty();
                        break;

                    default:
                        this._toError("Cannot reset while in the '" + this.getState() + "' state");
                        break;
                }
            },

            /**
            * @inheritDoc
            */
            getSource: function () {
                return this._source;
            },

            /**
            * @inheritDoc
            */
            getMimeType: function () {
                return this._mimeType;
            },

            /**
            * @inheritDoc
            */
            getCurrentTime: function () {
                switch (this.getState()) {
                    case MediaPlayer.STATE.STOPPED:
                    case MediaPlayer.STATE.ERROR:
                        break;

                    default:
                        if (this._mediaElement) {
                            return this._mediaElement.currentTime;
                        }
                        break;
                }
                return undefined;
            },

            /**
            * @inheritDoc
            */
            getRange: function () {
                switch (this.getState()) {
                    case MediaPlayer.STATE.STOPPED:
                    case MediaPlayer.STATE.ERROR:
                        break;

                    default:
                        return this._getSeekableRange();
                }
                return undefined;
            },

            _getSeekableRange: function () {
                if (this._mediaElement) {
                    var seekable = this._mediaElement.seekable;
                    var logger = RuntimeContext.getDevice().getLogger();

                    if (!seekable) {
                        logger.warn("'seekable' property missing from media element");

                    } else if (seekable.length === 1) {
                        return {
                            start: seekable.start(0),
                            end: seekable.end(0)
                        };

                    } else if (seekable.length > 1) {
                        logger.warn("Multiple seekable ranges detected");
                    }
                }
                return undefined;
            },

            /**
            * @inheritDoc
            */
            getState: function () {
                return this._state;
            },

            _onFinishedBuffering: function() {
                if (this.getState() !== MediaPlayer.STATE.BUFFERING) {
                    return;

                } else if (this._postBufferingState === MediaPlayer.STATE.PAUSED) {
                    this._toPaused();

                } else {
                    this._toPlaying();
                }
            },

            _onMediaError: function(evt) {
                this._toError("Media element emitted error with code: " + this._mediaElement.error.code);
            },

            _onSourceError: function(evt) {
                this._toError("Source element emitted error");
            },

            _onDeviceBuffering: function() {
                this._toBuffering();
            },

            _onEndOfMedia: function() {
                this._toComplete();
            },

            _onStatus: function() {
                if (this.getState() === MediaPlayer.STATE.PLAYING) {
                    this._emitEvent(MediaPlayer.EVENT.STATUS);
                }
            },

            _onMetadata: function() {
                if (this._waitingToSeek()) {
                    this._seekTo(this._targetSeekTime);
                    this._playIfNotAtEndOfMedia();
                    if (this._postBufferingState === MediaPlayer.STATE.PAUSED) {
                        this._mediaElement.pause();
                    }
                }
                this._targetSeekTime = undefined;
            },

            _onPlaying: function() {
                this._toPlaying();
            },

            _waitingToSeek: function () {
                return this._targetSeekTime !== undefined;
            },

            _seekTo: function(time) {
                this._mediaElement.currentTime = this._getClampedTime(time);
            },

            _playIfNotAtEndOfMedia: function() {
                if (!this._isAtEndOfMedia()) {
                    this._mediaElement.play();
                }
            },

            _isAtEndOfMedia: function () {
                var range = this.getRange();
                return this._mediaElement.currentTime === range.end;
            },

            _wipe: function () {
                this._type = undefined;
                this._source = undefined;
                this._mimeType = undefined;
                this._targetSeekTime = undefined;
                this._destroyMediaElement();
            },

            _destroyMediaElement: function () {
                if (this._mediaElement) {
                    this._mediaElement.removeEventListener("canplaythrough", this._wrapOnFinishedBuffering);
                    this._mediaElement.removeEventListener("error", this._wrapOnMediaError);
                    this._mediaElement.removeEventListener("ended", this._wrapOnEndOfMedia);
                    this._mediaElement.removeEventListener("waiting", this._wrapOnDeviceBuffering);
                    this._mediaElement.removeEventListener("timeupdate", this._wrapOnStatus);
                    this._mediaElement.removeEventListener("loadedmetadata", this._wrapOnMetadata);

                    var device = RuntimeContext.getDevice();
                    device.removeElement(this._mediaElement);

                    delete this._mediaElement;
                }
            },

            _toStopped: function () {
                this._state = MediaPlayer.STATE.STOPPED;
                this._emitEvent(MediaPlayer.EVENT.STOPPED);
            },

            _toBuffering: function () {
                this._state = MediaPlayer.STATE.BUFFERING;
                this._emitEvent(MediaPlayer.EVENT.BUFFERING);
            },

            _toPlaying: function () {
                this._state = MediaPlayer.STATE.PLAYING;
                this._emitEvent(MediaPlayer.EVENT.PLAYING);
            },

            _toPaused: function () {
                this._state = MediaPlayer.STATE.PAUSED;
                this._emitEvent(MediaPlayer.EVENT.PAUSED);
            },

            _toComplete: function () {
                this._state = MediaPlayer.STATE.COMPLETE;
                this._emitEvent(MediaPlayer.EVENT.COMPLETE);
            },

            _toEmpty: function () {
                this._wipe();
                this._state = MediaPlayer.STATE.EMPTY;
            },

            _toError: function (errorMessage) {
                RuntimeContext.getDevice().getLogger().error(errorMessage);
                this._wipe();
                this._state = MediaPlayer.STATE.ERROR;
                this._emitEvent(MediaPlayer.EVENT.ERROR);
            }
        });

        var instance = new Player();

        // Mixin this MediaPlayer implementation, so that device.getMediaPlayer() returns the correct implementation for the device
        Device.prototype.getMediaPlayer = function() {
            return instance;
        };

        return Player;
    }

);