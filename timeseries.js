/**
 * Determines whether a timeseries is "boring". This is defined as follows:
 * - a list of known boring series
 * - the name starts with 'total'.
 * - min and max are the same (which filters out static values)
 * - TODO: linear regression?
 * - TODO: less than 10 seconds?
 * - TODO: constant or linear after initial ramp-up?
 *
 * @param {string} name - the stats property name of the series.
 * @param {Array} series - timeseries as an array of [time, value].
 */
export function isBoring(name, series) {
    // Series which are interesting even if their value does not change.
    const interestingSeries = [
        'width', 'height',
        'frameWidth', 'frameHeight',
        'framesPerSecond',
        'targetBitrate',
        'nackCount', 'pliCount', 'firCount',
    ];
    if (interestingSeries.includes(name)) return false;

    if (name.startsWith('total')) return true;
    // Some of these should have been named total...
    const hiddenSeries = [
        'bytesReceived', 'bytesSent', 'retransmittedBytesSent', 'retransmittedBytesReceived',
        'headerBytesReceived', 'headerBytesSent',
        'packetsReceived', 'packetsSent', 'retransmittedBytesSent', 'retransmittedBytesReceived',
        'qpSum',
        'framesEncoded', 'framesDecoded', 'framesReceived', 'framesAssembled', 'framesAssembledFromMultiplePackets',
        'lastPacketReceivedTimestamp', 'lastPacketSentTimestamp',
        'remoteTimestamp', 'estimatedPlayoutTimestamp',
        'audioLevel',
        'jitterBufferEmittedCount', 'jitterBufferDelay', 'jitterBufferTargetDelay', 'jitterBufferMinimumDelay',
        'selectedCandidatePairChanges',
        'requestsSent', 'responsesReceived', 'requestsReceived', 'responsesSent', 'consentRequestsSent', // ICE
        'reportsSent', 'roundTripTimeMeasurements', // RTCP
    ];
    if (hiddenSeries.includes(name)) return true;

    const values = series.slice(1).map(item => item[1]);
    if (values[0] === values[values.length] - 1) {
        const min = Math.min.apply(null, values);
        const max = Math.max.apply(null, values);
        if (min === max) return true;
    }
    return false;
}
