const SDPUtils = window.adapter.sdp;

import {
    isBoring,
} from './timeseries.js';

function filterStatsGraphs(event, container) {
    const filter =  event.target.value;
    const filters = filter.split(',');
    container.childNodes.forEach(node => {
        if (node.nodeName !== 'DETAILS') {
            return;
        }
        const statsType = node.attributes['data-statsType'];
        if (!filter || filters.includes(statsType) ||
            filters.find(f => statsType.includes(f))) {
            node.style.display = 'block';
        } else {
            node.style.display = 'none';
        }
    });
}

export function processDescriptionEvent(container, eventType, description, last_sections, remote_sections) {
    const {type, sdp} = description;
    const sections = SDPUtils.splitSections(sdp);
    container.innerText += ' (type: "' + type + '", ' + sections.length + ' sections)';

    const copyBtn = document.createElement('button');
    copyBtn.innerText = '\uD83D\uDCCB'; // clipboard
    copyBtn.className = 'copyBtn';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(JSON.stringify({type, sdp}));
    };
    container.appendChild(copyBtn);

    let munged = false;
    const el = document.createElement('pre');
    sections.forEach((section, index) => {
        const lines = SDPUtils.splitLines(section);
        const mid = SDPUtils.getMid(section);
        const direction = SDPUtils.getDirection(section, sections[0]);

        const details = document.createElement('details');
        // Fold by default for large SDP.
        details.open = sections.length < 10 && direction !== 'inactive';
        details.innerText = section;

        const summary = document.createElement('summary');
        summary.innerText = lines[0] +
            ' (' + (lines.length - 1) + ' more lines)' +
            (mid ? ' mid=' + mid : '');
        if (lines[0].startsWith('m=')) {
            summary.innerText += ' direction=' + direction;
            const is_rejected = SDPUtils.parseMLine(lines[0]).port === 0;
            if (is_rejected) {
                summary.innerText += ' rejected';
                const was_rejected = remote_sections && remote_sections[index] &&
                    SDPUtils.parseMLine(remote_sections[index]).port === 0;
                if (['createOffer', 'createAnswer', 'setLocalDescription'].includes(eventType)) {
                    summary.style.backgroundColor = '#ddd';
                }
                details.open = false;
            }
        }
        if (last_sections && last_sections[index] !== sections[index]) {
            // Ignore triggering from simple reordering which is ok-ish.
            const last_lines = SDPUtils.splitLines(last_sections[index]).sort();
            const current_lines = SDPUtils.splitLines(sections[index]).sort();
            const mungedIndex = last_lines.findIndex((line, index) => line !== current_lines[index]);
            if (mungedIndex !== -1) {
                summary.innerText += ' munged';
                summary.style.backgroundColor = '#FBCEB1';
                summary.title = 'First munged line: ' + current_lines[mungedIndex];
                details.style.backgroundColor = '#FBCEB1';
                details.open = true;
            } else {
                summary.innerText += ' reordered';
                summary.style.backgroundColor = '#FBCEB1';
            }
            munged = true;
        }
        details.appendChild(summary);
        el.appendChild(details);
    });
    if (munged) {
        container.innerText += ' munged';
    }
    container.appendChild(el);
}

export function createContainers(connid, url, containers) {
    let el;
    const container = document.createElement('details');
    container.open = true;
    container.style.margin = '10px';

    const summary = document.createElement('summary');
    summary.innerText = 'Connection:' + connid + ' URL: ' + url;
    container.appendChild(summary);

    const configuration = document.createElement('div');
    container.appendChild(configuration);

    // show state transitions, like in https://webrtc.github.io/samples/src/content/peerconnection/states
    const signalingState = document.createElement('div');
    signalingState.id = 'signalingstate_' + connid;
    signalingState.textContent = 'Signaling state:';
    container.appendChild(signalingState);
    const iceConnectionState = document.createElement('div');
    iceConnectionState.id = 'iceconnectionstate_' + connid;
    iceConnectionState.textContent = 'ICE connection state:';
    container.appendChild(iceConnectionState);

    const connectionState = document.createElement('div');
    connectionState.id = 'connectionstate_' + connid;
    connectionState.textContent = 'Connection state:';
    container.appendChild(connectionState);

    const candidateContainer = document.createElement('details');
    container.style.margin = '10px';
    const candidateSummary = document.createElement('summary');
    candidateSummary.innerText = 'ICE candidate grid';
    candidateContainer.appendChild(candidateSummary);
    const candidates = document.createElement('table');
    candidates.className = 'candidatepairtable';
    candidateContainer.appendChild(candidates);
    container.appendChild(candidateContainer);

    const updateLog = document.createElement('table');
    const head = document.createElement('tr');
    updateLog.appendChild(head);

    el = document.createElement('th');
    el.innerText = 'Time';
    head.appendChild(el);

    el = document.createElement('th');
    el.innerText = 'Event';
    head.appendChild(el);

    container.appendChild(updateLog);

    const graphHeader = document.createElement('div');
    const graphs = document.createElement('div');

    const label = document.createElement('label');
    label.innerText = 'Filter graphs by type including ';
    graphHeader.appendChild(label);
    const input = document.createElement('input');
    input.placeholder = 'separate multiple values by `,`';
    input.size = 25;
    input.oninput = (e) => filterStatsGraphs(e, graphs);
    graphHeader.appendChild(input);

    graphs.appendChild(graphHeader);
    container.appendChild(graphs);

    containers[connid] = {
        updateLog,
        iceConnectionState,
        connectionState,
        signalingState,
        candidates,
        url: summary,
        configuration,
        graphs,
    };

    return container;
}

export function createCandidateTable(lastStats, parentElement) {
    const head = document.createElement('tr');
    [
        'Transport id',
        'Candidate pair id',
        'Candidate id',
        '', // local/remote, leave empty
        'type',
        'address',
        'port',
        'protocol',
        'priority / relayProtocol',
        'interface',
        'requestsSent / responsesReceived',
        'requestsReceived / responsesSent',
    ].forEach((text) => {
        const el = document.createElement('td');
        el.innerText = text;
        head.appendChild(el);
    });
    parentElement.appendChild(head);

    for (let transportId in lastStats) {
        if (lastStats[transportId].type !== 'transport') continue;
        const transport = lastStats[transportId];

        let row = document.createElement('tr');
        let el = document.createElement('td');
        el.innerText = transportId;
        row.appendChild(el);

        el = document.createElement('td');
        el.innerText = transport.selectedCandidatePairId || '(none)';
        row.appendChild(el);

        for (let i = 2; i < head.childElementCount; i++) {
            el = document.createElement('td');
            row.appendChild(el);
        }

        parentElement.appendChild(row);

        for (let pairId in lastStats) {
            if (lastStats[pairId].type !== 'candidate-pair') continue;
            const pair = lastStats[pairId];
            if (pair.transportId !== transportId) continue;
            row = document.createElement('tr');

            row.appendChild(document.createElement('td'));

            el = document.createElement('td');
            el.innerText = pairId;
            row.appendChild(el);

            parentElement.appendChild(row);
            for (let i = 2; i < head.childElementCount; i++) {
                el = document.createElement('td');
                if (i === 8) {
                    el.innerText = pair.priority;
                } else if (i === 10) {
                    el.innerText = (pair.requestsSent + pair.consentRequestsSent) + ' / ' + pair.responsesReceived;
                    if (pair.bytesSent) el.innerText += '\nPayload bytesSent=' + pair.bytesSent;
                } else if (i === 11) {
                    el.innerText = pair.requestsReceived + ' / ' + pair.responsesSent;
                    if (pair.bytesReceived) el.innerText += '\nPayload bytesReceived=' + pair.bytesReceived;
                }
                row.appendChild(el);
            }

            for (let candidateId in lastStats) {
                if (!['local-candidate', 'remote-candidate'].includes(lastStats[candidateId].type)) continue;
                if (!(candidateId === pair.localCandidateId || candidateId === pair.remoteCandidateId)) continue;
                const candidate = lastStats[candidateId];
                row = document.createElement('tr');

                row.appendChild(document.createElement('td'));
                row.appendChild(document.createElement('td'));
                el = document.createElement('td');
                el.innerText = candidateId;
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.isRemote ? 'remote' : 'local';
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.candidateType;
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.address || candidate.ip;
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.port;
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.protocol;
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.priority;
                if (candidate.relayProtocol) {
                    el.innerText += ' ' + candidate.relayProtocol;
                }
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.networkType || 'unknown';
                row.appendChild(el);

                row.appendChild(document.createElement('td'));
                row.appendChild(document.createElement('td'));

                parentElement.appendChild(row);
            }
        }
    }
}

export function processGetUserMedia(data, parentElement) {
    const container = document.createElement('details');
    container.open = true;
    container.style.margin = '10px';

    const summary = document.createElement('summary');
    summary.innerText = 'getUserMedia calls (' + (data.length / 2)+ ')';
    container.appendChild(summary);

    const table = document.createElement('table');
    const head = document.createElement('tr');
    table.appendChild(head);

    container.appendChild(table);

    const columns = ['request_type', 'origin', 'pid', 'rid',
        'audio', 'video', 'audio_track_info', 'video_track_info',
        'error', 'error_message'];
    const displayNames = {
        request_id: 'id',
        reqest_type: 'type',
        audio: 'audio constraints',
        video: 'video constraints',
        audio_track_info: 'audio track',
        video_track_info: 'video track',
        error_message: 'error message',
    };
    columns.forEach(name => {
        let el;
        el = document.createElement('th');
        el.innerText = displayNames[name] || name;
        head.appendChild(el);
    });

    parentElement.appendChild(container);
    data.forEach(gumEvent => {
        const id = [container.id, 'gum-row', gumEvent.pid, gumEvent.rid, gumEvent.request_id].join('-');
        if (!gumEvent.origin) {
            // Not a getUserMedia call but a response, update the row with the request.
            const existingRow = document.getElementById(id);
            if (gumEvent.error) {
                existingRow.childNodes[8].innerText = gumEvent.error;
                existingRow.childNodes[9].innerText = gumEvent.error_message;
                return;
            }
            if (gumEvent.audio_track_info) {
                existingRow.childNodes[6].innerText = gumEvent.audio_track_info;
            }
            if (gumEvent.video_track_info) {
                existingRow.childNodes[7].innerText = gumEvent.video_track_info;
            }
            return;
        }
        // Add a new row for the getUserMedia request.
        const row = document.createElement('tr');
        row.id = id;
        columns.forEach(attribute => {
            const cell = document.createElement('td');
            const el = document.createElement('pre');
            if (['audio', 'video'].includes(attribute)) {
                el.innerText = gumEvent.hasOwnProperty(attribute) ? (gumEvent[attribute] || 'true') : 'not set';
            } else {
                el.innerText = gumEvent.hasOwnProperty(attribute) ? gumEvent[attribute] : '';
            }
            cell.appendChild(el);
            row.appendChild(cell);
        });
        table.appendChild(row);
    });
}

export function createGraphOptions(statsId, statsType, reports, referenceTime) {
    const series = [];
    series.statsType = statsType;
    const plotBands = [];
    const labels = {
        type: statsType,
        id: statsId,
    };
    reports.sort().forEach(report => {
        const [name, data, statsType] = report;
        // set up a x-axis plotbands:
        // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
        if (name === 'active' && statsType === 'outbound-rtp') {
            data.filter((el, index, values) => {
                return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
            }).forEach((item, index, values) => {
                if (item[1] === true) {
                    return;
                }
                plotBands.push({
                    from: item[0],
                    to: (values[index + 1] || [])[0],
                    label: {
                        align: 'center',
                        text: 'sender disabled',
                    },
                });
            });
            return;
        }
        if (name === 'qualityLimitationReason' && statsType === 'outbound-rtp') {
            data.filter((el, index, values) => {
                return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
            }).forEach((item, index, values) => {
                if (item[1] === 'none') {
                    return;
                }
                plotBands.push({
                    from: item[0],
                    to: (values[index + 1] || [])[0],
                    label: {
                        align: 'center',
                        text: item[1] + '-limited',
                    },
                });
            });
            return;
        }
        if (['encoderImplementation', 'decoderImplementation'].includes(name) && ['inbound-rtp', 'outbound-rtp'].includes(statsType)) {
            data.filter((el, index, values) => {
                return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
            }).forEach((item, index, values) => {
                plotBands.push({
                    from: item[0],
                    to: (values[index + 1] || [])[0],
                    label: {
                        align: 'left',
                        text: name + ': ' + item[1],
                    },
                    color: index % 2 === 0 ? 'white' : 'rgba(253, 253, 222, 0.3)',
                });
            });
            return;
        }
        if (name === 'scalabilityMode' && statsType === 'outbound-rtp') {
            data.filter((el, index, values) => {
                return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
            }).forEach((item, index, values) => {
                plotBands.push({
                    from: item[0],
                    to: (values[index + 1] || [])[0],
                    label: {
                        align: 'right',
                        text: name + ': ' + item[1],
                        y: 30,
                    },
                    // This one is fully transparent (white with 100% alpha) since it overlaps with encoderImplementation.
                    color: (255, 255, 255, 1),
                    // But has a 1px border so it is possible to see changes unrelated to codec switches.
                    borderWidth: 1,
                    borderColor: 'rgba(189, 189, 189, 0.3)',
                });
            });
            return;
        }

        const statsForLabels = [
            'kind', 'mid', 'rid', 'encodingIndex',
            'ssrc', 'rtxSsrc', 'fecSsrc',
            'encoderImplementation', 'decoderImplementation', 'scalabilityMode',
            'scalabilityMode', '[codec]',
            'label', // for datachannels
        ];
        if (statsForLabels.includes(name)) {
            labels[name] = data[0][1];
        }
        series.id = statsId;

        if (typeof(data[0][1]) !== 'number') return;
        const ignoredSeries = [
            'timestamp',
            'protocol', 'dataChannelIdentifier',
            'streamIdentifier', 'trackIdentifier',
            'priority', 'port',
            'ssrc', 'rtxSsrc', 'fecSsrc',
            'mid', 'rid', 'encodingIndex',
        ];
        if (ignoredSeries.includes(name)) {
            return;
        }

        const secondYAxis = [
            // candidate-pair
            'consentRequestsSent', 'requestsSent', 'requestsReceived', 'responsesSent', 'responsesReceived',
            // data-channel
            '[messagesReceived/s]', '[messagesSent/s]',
            // inbound-rtp
            '[framesReceived/s]', '[framesDecoded/s]', '[keyFramesDecoded/s]', 'frameWidth', 'frameHeight',
            // outbound-rtp'
            '[framesSent/s]', '[framesEncoded/s]', '[keyFramesEncoded/s]', 'frameWidth', 'frameHeight',
        ];

        // Hide "boring" series. Graphs with all boring series should be deprioritized too.
        const hidden = isBoring(name, data);
        series.push({
            name,
            data,
            visible: !hidden,
            yAxis: secondYAxis.includes(name) ? 1 : 0,
        });
    });
    labels['visibleSeries'] = series.filter(s => s.visible).length + '/' + series.length;

    // Optionally start all graphs at the same point in time.
    if (referenceTime) {
        series
            .filter(s => s.data[0].length)
            .map(s => {
                if (s.data[0] !== referenceTime) {
                    s.data.unshift([referenceTime, undefined]);
                }
            });
    }

    // TODO: it would be nice to sort the graphs such that same mids go together.
    if (series.length === 0) {
        return;
    }
    return {
        title: {
            text: null
        },
        xAxis: {
            type: 'datetime',
            plotBands,
        },
        yAxis: [{
            min: series.kind ? 0 : undefined
        },
        {
            min: series.kind ? 0 : undefined
        },
        ],
        chart: {
            zoomType: 'x',
        },
        series,
        labels,
    };
}
