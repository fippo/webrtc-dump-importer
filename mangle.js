// using shiftwidth=2 since reformating all the adapter code...
function mangle(stats) {
  // Mangle chrome stats to spec stats. Just chrome stats.
  var needsMangling = false;
  Object.keys(stats).forEach(function(id) {
      if (stats[id].type === 'googComponent') {
          needsMangling = true;
      }
  });
  if (!needsMangling) {
      return stats;
  }
  // taken from https://github.com/fippo/adapter/tree/getstats-mangling
  var standardReport = {};
  Object.keys(stats).forEach(function(id) {
    var standardStats = stats[id];

    // Step 1: translate to standard types and attribute names.
    switch (standardStats.type) {
      case 'ssrc':
        standardStats.trackIdentifier = standardStats.googTrackId;
        // FIXME: not defined in spec, probably whether the track is
        //  remote?
        standardStats.remoteSource =
            standardStats.id.indexOf('recv') !== -1;
        standardStats.ssrc = parseInt(standardStats.ssrc, 10);

        /* done in client since it needs access to PC
        if (!standardStats.mediaType && standardStats.googTrackId) {
          // look up track kind in local or remote streams.
          var streams = standardStats.remoteSource ?
              pc.getRemoteStreams() : pc.getLocalStreams();
          for (var i = 0; i < streams.length && !standardStats.mediaType;
              i++) {
            var tracks = streams[i].getTracks();
            for (var j = 0; j < tracks.length; j++) {
              if (tracks[j].id === standardStats.googTrackId) {
                standardStats.mediaType = tracks[j].kind;
              }
            }
          }
        }
        */

        // FIXME: 'only makes sense' <=> not set?
        if (standardStats.googFrameWidthReceived ||
            standardStats.googFrameWidthSent) {
          standardStats.frameWidth = parseInt(
              standardStats.googFrameWidthReceived ||
              standardStats.googFrameWidthSent, 10);
        }
        if (standardStats.googFrameHeightReceived ||
            standardStats.googFrameHeightSent) {
          standardStats.frameHeight = parseInt(
              standardStats.googFrameHeightReceived ||
              standardStats.googFrameHeightSent, 10);
        }
        if (standardStats.googFrameRateInput ||
            standardStats.googFrameRateReceived) {
          // FIXME: might be something else not available currently
          standardStats.framesPerSecond = parseInt(
              standardStats.googFrameRateInput ||
              standardStats.googFrameRateReceived, 10);
        }

        /* FIXME unfortunately the current stats (googFrameRateSent,
         * googFrameRateReceived, googFrameRateDecoded) so we can not
         * calculate the cumulative amount.
         * FIXME (spec) Firefox has frameRateMean why is this
         * not part of the spec?
         */
        if (standardStats.googFrameRateSent) {
          standardStats.framesSent = 0;
        }
        if (standardStats.googFrameRateReceived) {
          standardStats.framesReceived = 0;
        }
        if (standardStats.googFrameRateDecoded) {
          standardStats.framesDecoded = 0;
        }
        // FIXME: both on sender and receiver?
        if (standardStats.mediaType === 'video') {
          standardStats.framesDropped = 0;
        }
        if (standardStats.audioInputLevel ||
            standardStats.audioOutputLevel) {
          standardStats.audioLevel = parseInt(
              standardStats.audioInputLevel ||
              standardStats.audioOutputLevel, 10) / 32767.0;
        }

        if (standardStats.googJitterReceived) {
          standardStats.jitter = 1.0 * parseInt(
              standardStats.googJitterReceived, 10);
        }
        // FIXME: fractionLost

        if (standardStats.googFirsReceived || standardStats.googFirsSent) {
          standardStats.firCount = parseInt(
              standardStats.googFirsReceived ||
              standardStats.googFirsSent, 10);
        }
        if (standardStats.googPlisReceived || standardStats.googPlisSent) {
          standardStats.pliCount = parseInt(
              standardStats.googPlisReceived ||
              standardStats.googPlisSent, 10);
        }
        if (standardStats.googNacksReceived ||
            standardStats.googNacksSent) {
          standardStats.nackCount = parseInt(
              standardStats.googNacksReceived ||
              standardStats.googNacksSent, 10);
        }
        // FIXME: no SLI stats yet?

        if (standardStats.bytesSent) {
          standardStats.bytesSent = parseInt(standardStats.bytesSent, 10);
        }
        if (standardStats.bytesReceived) {
          standardStats.bytesReceived = parseInt(
              standardStats.bytesReceived, 10);
        }
        if (standardStats.packetsSent) {
          standardStats.packetsSent = parseInt(
              standardStats.packetsSent, 10);
        }
        if (standardStats.packetsReceived) {
          standardStats.packetsReceived = parseInt(
              standardStats.packetsReceived, 10);
        }
        if (standardStats.packetsLost) {
          standardStats.packetsLost = parseInt(
              standardStats.packetsLost, 10);
        }
        if (standardStats.googEchoCancellationReturnLoss) {
          standardStats.echoReturnLoss = 1.0 * parseInt(
              standardStats.googEchoCancellationReturnLoss, 10);
          standardStats.echoReturnLossEnhancement = 1.0 * parseInt(
              standardStats.googEchoCancellationReturnLossEnhancement, 10);
        }
        if (standardStats.googRtt) {
          // This is the RTCP RTT.
          standardStats.roundTripTime = parseInt(standardStats.googRtt, 10);
        }
        if (standardStats.googEncodeUsagePercent) {
          standardStats.googEncodeUsagePercent = parseInt(standardStats.googEncodeUsagePercent, 10);
        }
        break;
      case 'localcandidate':
      case 'remotecandidate':
        // https://w3c.github.io/webrtc-stats/#icecandidate-dict*
        standardStats.portNumber = parseInt(standardStats.portNumber, 10);
        standardStats.priority = parseInt(standardStats.priority, 10);
        // FIXME: addressSourceUrl?
        // FIXME: https://github.com/w3c/webrtc-stats/issues/12
        break;
      case 'googCandidatePair':
        // https://w3c.github.io/webrtc-stats/#candidatepair-dict*
        standardStats.transportId = standardStats.googChannelId;
        // FIXME: maybe set depending on iceconnectionstate and read/write?
        //standardStats.state = 'FIXME'; // enum

        // FIXME: could be calculated from candidate priorities and role.
        //standardStats.priority = 'FIXME'; // unsigned long long
        standardStats.writable = standardStats.googWritable === 'true';
        standardStats.readable = standardStats.googReadable === 'true';
        // assumption: nominated is readable and writeable.
        standardStats.nominated = standardStats.readable &&
            standardStats.writable;
        // FIXME: missing from spec
        standardStats.selected =
            standardStats.googActiveConnection === 'true';
        standardStats.bytesSent = parseInt(standardStats.bytesSent, 10);
        standardStats.bytesReceived = parseInt(
            standardStats.bytesReceived, 10);
        // FIXME: packetsSent is not in spec?
        // FIXME: no packetsReceived?
        standardStats.packetsSent = parseInt(
            standardStats.packetsSent, 10);
        standardStats.packetsDiscardedOnSend = parseInt(
            standardStats.packetsDiscardedOnSend, 10);

        // This is the STUN RTT.
        standardStats.roundTripTime = parseInt(standardStats.googRtt, 10);

        // backfilled later from videoBWE.
        standardStats.availableOutgoingBitrate = 0.0;
        standardStats.availableIncomingBitrate = 0.0;

        standardStats.requestsSent >>>= 0; 
        standardStats.responsesReceived >>>= 0; 

        standardStats.requestsReceived >>>= 0;
        standardStats.responsesSent >>>= 0;
        standardStats.consentRequestsSent >>>= 0;
        break;
      case 'googComponent':
        // additional RTCTransportStats created later since we
        // want the normalized fields and complete snowball.
        break;
      case 'googCertificate':
        standardStats.type = 'certificate'; // FIXME spec: undefined in spec.
        standardStats.fingerprint = standardStats.googFingerprint;
        standardStats.fingerprintAlgorithm =
            standardStats.googFingerprintAlgorithm;
        standardStats.base64Certificate = standardStats.googDerBase64;
        standardStats.issuerCertificateId = null; // FIXME spec: undefined what 'no issuer' is.
        break;
      case 'VideoBwe':
        standardStats.availableOutgoingBitrate = 1.0 *
            parseInt(standardStats.googAvailableSendBandwidth, 10);
        standardStats.availableIncomingBitrate = 1.0 *
            parseInt(standardStats.googAvailableReceiveBandwidth, 10);
        // not really standard...
        standardStats.googBucketDelay = parseInt(standardStats.googBucketDelay, 10);
        standardStats.googTransmitBitrate = parseInt(standardStats.googTransmitBitrate, 10);
        standardStats.googRetransmitBitrate = parseInt(standardStats.googRetransmitBitrate, 10);
        standardStats.googTargetEncBitrate = parseInt(standardStats.googTargetEncBitrate, 10);
        break;
      default:
        break;
    }
    standardReport[standardStats.id] = standardStats;
  });
  // Step 2: fix things spanning multiple reports.
  Object.keys(standardReport).forEach(function(id) {
    var report = standardReport[id];
    var other, newId, sdp;
    switch (report.type) {
      case 'googCandidatePair':
        report.type = 'candidatepair';
        if (standardReport.bweforvideo) {
          report.availableOutgoingBitrate =
              standardReport.bweforvideo.availableOutgoingBitrate;
          report.availableIncomingBitrate =
              standardReport.bweforvideo.availableIncomingBitrate;
          standardReport[report.id] = report;
        }
        break;
      case 'googComponent':
        // create a new report since we don't carry over all fields.
        other = standardReport[report.selectedCandidatePairId];
        newId = 'transport_' + report.id;
        standardReport[newId] = {
          type: 'transport',
          timestamp: report.timestamp,
          id: newId,
          bytesSent: other && other.bytesSent || 0,
          bytesReceived: other && other.bytesReceived || 0,
          // FIXME (spec): rtpcpTransportStatsId: rtcp-mux is required so...
          activeConnection: other && other.selected,
          selectedCandidatePairId: report.selectedCandidatePairId,
          localCertificateId: report.localCertificateId,
          remoteCertificateId: report.remoteCertificateId
        };
        break;
      case 'ssrc':
        newId = 'rtpstream_' + report.id;
        // Workaround for https://code.google.com/p/webrtc/issues/detail?id=4808 (fixed in M46)
        /* it is not apparently. This can be set to the empty string.
        if (!report.googCodecName) {
          report.googCodecName = 'VP8';
        }
        */
        standardReport[newId] = {
          //type: 'notastandalonething',
          timestamp: report.timestamp,
          id: newId,
          ssrc: report.ssrc,
          mediaType: report.mediaType,
          associateStatsId: 'rtcpstream_' + report.id,
          isRemote: false,
          mediaTrackId: 'mediatrack_' + report.id,
          transportId: report.transportId,
        };
        if (report.googCodecName && report.googCodecName.length) {
          standardReport.codecId = 'codec_' + report.googCodecName
        }
        if (report.mediaType === 'video') {
          standardReport[newId].firCount = report.firCount;
          standardReport[newId].pliCount = report.pliCount;
          standardReport[newId].nackCount = report.nackCount;
          standardReport[newId].sliCount = report.sliCount; // undefined yet
        }
        if (report.remoteSource) {
          standardReport[newId].type = 'inboundrtp';
          standardReport[newId].packetsReceived = report.packetsReceived;
          standardReport[newId].bytesReceived = report.bytesReceived;
          standardReport[newId].packetsLost = report.packetsLost;
        } else {
          standardReport[newId].type = 'outboundrtp';
          standardReport[newId].packetsSent = report.packetsSent;
          standardReport[newId].bytesSent = report.bytesSent;
          standardReport[newId].roundTripTime = report.roundTripTime;
          // TODO: targetBitrate
        }

        // FIXME: this is slightly more complicated. inboundrtp can have packetlost
        // but so can outboundrtp via rtcp (isRemote = true)
        // need to unmux with opposite type and put loss into remote report.
        newId = 'rtcpstream_' + report.id;
        standardReport[newId] = {
          //type: 'notastandalonething',
          timestamp: report.timestamp,
          id: newId,
          ssrc: report.ssrc,
          associateStatsId: 'rtpstream_' + report.id,
          isRemote: true,
          mediaTrackId: 'mediatrack_' + report.id,
          transportId: report.transportId,
          codecId: 'codec_' + report.googCodecName
        };
        if (report.remoteSource) {
          standardReport[newId].type = 'outboundrtp';
          standardReport[newId].packetsSent = report.packetsSent;
          standardReport[newId].bytesSent = report.bytesSent;
          standardReport[newId].roundTripTime = report.roundTripTime;
          standardReport[newId].packetsLost = report.packetsLost;
        } else {
          standardReport[newId].type = 'inboundrtp';
          standardReport[newId].packetsReceived = report.packetsReceived;
          standardReport[newId].bytesReceived = report.bytesReceived;
          standardReport[newId].packetsLost = report.packetsLost;
        }
        // FIXME: one of these is not set?
        if (report.jitter) {
          standardReport[newId].jitter = report.jitter;
        }

        newId = 'mediatrack_' + report.id;
        standardReport[newId] = {
          type: 'track',
          timestamp: report.timestamp,
          id: newId,
          trackIdentifier: report.trackIdentifier,
          remoteSource: report.remoteSource,
          ssrcIds: ['rtpstream_' + report.id, 'rtcpstream_' + report.id]
        };
        if (report.mediaType === 'audio') {
          standardReport[newId].audioLevel = report.audioLevel;
          if (report.id.indexOf('send') !== -1) {
            standardReport[newId].echoReturnLoss = report.echoReturnLoss;
            standardReport[newId].echoReturnLossEnhancement =
                report.echoReturnLossEnhancement;
          }
        } else if (report.mediaType === 'video') {
          standardReport[newId].frameWidth = report.frameWidth;
          standardReport[newId].frameHeight = report.frameHeight;
          standardReport[newId].framesPerSecond = report.framesPerSecond;
          if (report.remoteSource) {
            standardReport[newId].framesReceived = report.framesReceived;
            standardReport[newId].framesDecoded = report.framesDecoded;
            standardReport[newId].framesDropped = report.framesDropped;
            standardReport[newId].framesCorrupted = report.framesCorrupted;
          } else {
            standardReport[newId].framesSent = report.framesSent;
          }
        }

        // We have one codec item per codec name.
        // This might be wrong (in theory) since with unified plan
        // we can have multiple m-lines and codecs and different
        // payload types/parameters but unified is not supported yet.
        /*
        if (!standardReport['codec_' + report.googCodecName]) {
          // determine payload type (from offer) and negotiated (?spec)
          // parameters (from answer). (parameters not negotiated yet)
          if (pc.localDescription &&
              pc.localDescription.type === 'offer') {
            sdp = pc.localDescription.sdp;
          } else if (pc.remoteDescription &&
              pc.remoteDescription.type === 'offer') {
            sdp = pc.remoteDescription.sdp;
          }
          if (sdp) {
            // TODO: use a SDP library instead of this regexp-stringsoup approach.
            var match = sdp.match(new RegExp('a=rtpmap:(\\d+) ' +
                report.googCodecName + '\\/(\\d+)(?:\\/(\\d+))?'));
            if (match) {
              newId = 'codec_' + report.id;
              standardReport[newId] = {
                type: 'codec', // FIXME (spec)
                timestamp: report.timestamp,
                id: newId,
                codec: report.googCodecName,
                payloadType: parseInt(match[1], 10),
                clockRate: parseInt(match[2], 10),
                channels: parseInt(match[3] || '1', 10),
                parameters: ''
              };
            }
          }
        }
        */
        break;
      default:
        break;
    }
  });
  // Step 3: fiddle the transport in between transport and rtp stream
  Object.keys(standardReport).forEach(function(id) {
    var report = standardReport[id];
    if (report.type === 'transprort') {
      // RTCTransport has a pointer to the selectedCandidatePair...
      var other = standardReport[report.selectedCandidatePairId];
      if (other) {
        other.transportId = report.id;
      }
      // but no pointers to the rtpstreams running over it?!
      // instead, we rely on having added 'transport_'
      Object.keys(standardReport).forEach(function(otherid) {
        other = standardReport[otherid];
        if ((other.type === 'inboundrtp' ||
            other.type === 'outboundrtp') &&
            report.id === 'transport_' + other.transportId) {
          other.transportId = report.id;
        }
      });
    }
  });
  return standardReport;
}
