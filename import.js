function doImport(evt) {
  evt.target.disabled = true;
  document.getElementById('useReferenceTime').disabled = true;

  const files = evt.target.files;
  const reader = new FileReader();
  reader.onload = ((file) => {
    return (e) => {
      let result = e.target.result;
      if (typeof result === 'object') {
        result = pako.inflate(result, {to: 'string'});
      }
      const theLog = JSON.parse(result);
      importUpdatesAndStats(theLog);
    };
  })(files[0]);
  if (files[0].type === 'application/gzip') {
    reader.readAsArrayBuffer(files[0]);
  } else {
    reader.readAsText(files[0]);
  }
}

function createCandidateTable(container, allStats) {
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
    container.appendChild(head);

    const transports = {};
    const pairs = {};
    const candidates = {};
    for (reportname in allStats) {
        let t = reportname.split('-');
        const comp = t.pop();
        t = t.join('-');
        const statsType = allStats[reportname].statsType;
        const stats = JSON.parse(allStats[reportname].values);
        if (statsType === 'transport' || reportname.startsWith('RTCTransport')) {
            if (!transports[t]) transports[t] = {};
            switch(comp) {
            case 'bytesSent':
            case 'bytesReceived':
            case 'dtlsState':
            case 'selectedCandidatePairId':
                transports[t][comp] = stats[stats.length - 1];
            default:
                // console.log(reportname, comp, stats);
            }
        } else if (statsType === 'candidate-pair' || reportname.startsWith('RTCIceCandidatePair')) {
            if (!pairs[t]) pairs[t] = {};
            pairs[t][comp] = stats[stats.length - 1];
        } else if (['local-candidate', 'remote-candidate'].includes(statsType) || reportname.startsWith('RTCIceCandidate')) {
            if (!candidates[t]) candidates[t] = {};
            candidates[t][comp] = stats[stats.length -  1]
        }
    }
    for (t in transports) {
        let row = document.createElement('tr');

        let el = document.createElement('td');
        el.innerText = t;
        row.appendChild(el);

        el = document.createElement('td');
        el.innerText = transports[t].selectedCandidatePairId;
        row.appendChild(el);

        for (let i = 2; i < head.childElementCount; i++) {
            el = document.createElement('td');
            row.appendChild(el);
        }

        container.appendChild(row);

        for (p in pairs) {
            if (pairs[p].transportId !== t) continue;
            const pair = pairs[p];
            row = document.createElement('tr');

            row.appendChild(document.createElement('td'));

            el = document.createElement('td');
            el.innerText = p;
            row.appendChild(el);

            container.appendChild(row);
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

            for (c in candidates) {
                if (!(c === pair.localCandidateId || c === pair.remoteCandidateId)) continue;
                const candidate = candidates[c];
                row = document.createElement('tr');

                row.appendChild(document.createElement('td'));
                row.appendChild(document.createElement('td'));
                el = document.createElement('td');
                el.innerText = c;
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

                container.appendChild(row);
            }
        }
    }
}

function createContainers(connid, url) {
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

    const candidates = document.createElement('table');
    candidates.className = 'candidatepairtable';
    container.appendChild(candidates);

    const updateLog = document.createElement('table');
    head = document.createElement('tr');
    updateLog.appendChild(head);

    el = document.createElement('th');
    el.innerText = 'connection ' + connid;
    head.appendChild(el);

    el = document.createElement('th');
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

    container.appendChild(graphHeader);
    container.appendChild(graphs);

    containers[connid] = {
        updateLog,
        iceConnectionState,
        connectionState,
        signalingState,
        candidates,
        url,
        configuration,
        graphs,
    };

    return container;
}

function processGUM(data) {
    const container = document.createElement('details');
    container.open = true;
    container.style.margin = '10px';

    const summary = document.createElement('summary');
    summary.innerText = 'getUserMedia calls';
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

    document.getElementById('tables').appendChild(container);
    data.forEach(event => {
        const id = ['gum-row', event.pid, event.rid, event.request_id].join('-');
        if (!event.origin) {
            // Not a getUserMedia call but a response.
            const existingRow = document.getElementById(id);
            if (event.error) {
                existingRow.childNodes[8].innerText = event.error;
                existingRow.childNodes[9].innerText = event.error_message;
                return;
            }
            if (event.audio_track_info) {
                existingRow.childNodes[6].innerText = event.audio_track_info;
            }
            if (event.video_track_info) {
                existingRow.childNodes[7].innerText = event.video_track_info;
            }
            return;
        }
        const row = document.createElement('tr');
        row.id = id;
        columns.forEach(attribute => {
            const cell = document.createElement('td');
            // getUserMedia request.
            if (['audio', 'video'].includes(attribute)) {
                cell.innerText = event.hasOwnProperty(attribute) ? (event[attribute] || 'true') : 'not set';
            } else {
                cell.innerText = event.hasOwnProperty(attribute) ? event[attribute] : '';
            }
            row.appendChild(cell);
        });
        table.appendChild(row);
    });
}

function processTraceEvent(table, event) {
    const row = document.createElement('tr');
    let el = document.createElement('td');
    el.setAttribute('nowrap', '');
    el.innerText = event.time;
    row.appendChild(el);

    // recreate the HTML of webrtc-internals
    const details = document.createElement('details');
    el = document.createElement('summary');
    el.innerText = event.type;
    details.appendChild(el);

    if (event.type === 'icecandidate' || event.type === 'addIceCandidate') {
        if (event.value) {
            const parts = event.value.split(', ');
            el.innerText += ' (' + parts[0] + ' ' + parts[1];
            const candidate = SDPUtils.parseCandidate(parts[2].substr(11).trim());
            if (candidate) {
                el.innerText += ', type:' + candidate.type;
                el.innerText += ', port:' + candidate.port;
            }
            el.innerText += ')';
        }
    }
    if (event.value.indexOf(', sdp: ') != -1) {
        const [type, sdp] = event.value.substr(6).split(', sdp: ');
        const sections = SDPUtils.splitSections(sdp);

        el.innerText += ' (type: "' + type + '", ' + sections.length + ' sections)';
        const copyBtn = document.createElement('button');
        copyBtn.innerText = '\uD83D\uDCCB'; // clipboard
        copyBtn.className = 'copyBtn';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify({type, sdp}));
        };
        el.appendChild(copyBtn);

        el = document.createElement('pre');
        sections.forEach(section => {
            const lines = SDPUtils.splitLines(section);
            const mid = lines
                .filter(line => line.startsWith('a=mid:'))
                .map(line => line.substr(6))[0];

            const details = document.createElement('details');
            // Fold by default for large SDP.
            details.open = sections.length < 10;
            details.innerText = section;

            const summary = document.createElement('summary');
            summary.innerText = lines[0] +
                ' (' + (lines.length - 1) + ' more lines)' +
                (mid ? ' mid=' + mid : '');
            details.appendChild(summary);
            el.appendChild(details);
        });
    } else {
        el = document.createElement('pre');
        el.innerText = event.value;
    }
    details.appendChild(el);
    el = document.createElement('td');
    el.appendChild(details);

    row.appendChild(el);

    // guess what, if the event type ends with 'Failure' one could use css to highlight it
    if (event.type.endsWith('Failure')) {
        row.style.backgroundColor = 'red';
    }


    if (event.type === 'iceconnectionstatechange' || event.type === 'connectionstatechange') {
        switch(event.value) {
        case 'connected':
        case 'completed':
            row.style.backgroundColor = 'green';
            break;
        case 'failed':
            row.style.backgroundColor = 'red';
            break;
        }
    }
    table.appendChild(row);
}

const graphs = {};
const containers = {};
function importUpdatesAndStats(data) {
    document.getElementById('userAgent').innerText = data.UserAgent;
    document.getElementById('tables').style.display = 'block';

    // FIXME: also display GUM calls (can they be correlated to addStream?)
    processGUM(data.getUserMedia);

    // first, display the updateLog
    for (connid in data.PeerConnections) {
        const connection = data.PeerConnections[connid];
        const container = createContainers(connid, connection.url);

        containers[connid].url.innerText = 'Origin: ' + connection.url;
        containers[connid].configuration.innerText = 'Configuration: ' + JSON.stringify(connection.rtcConfiguration, null, ' ') + '\n';
        containers[connid].configuration.innerText += 'Legacy (chrome) constraints: ' + JSON.stringify(connection.constraints, null, ' ');

        document.getElementById('tables').appendChild(container);

        connection.updateLog.forEach(event => {
            processTraceEvent(containers[connid].updateLog, event);
        });
        connection.updateLog.forEach(event => {
            // update state displays
            if (event.type === 'iceconnectionstatechange') {
                containers[connid].iceConnectionState.textContent += ' => ' + event.value;
            }
            if (event.type === 'connectionstatechange') {
                containers[connid].connectionState.textContent += ' => ' + event.value;
            }
        });
        connection.updateLog.forEach(event => {
            // FIXME: would be cool if a click on this would jump to the table row
            if (event.type === 'signalingstatechange') {
                containers[connid].signalingState.textContent += ' => ' + event.value;
            }
        });
        let legacy = false;
        for (reportname in connection.stats) {
            if (reportname.startsWith('Conn-')) {
                legacy = true;
                break;
            }
        }
        if (!legacy) {
            createCandidateTable(containers[connid].candidates, connection.stats);
        } else {
            document.getElementById('legacy').style.display = 'block';
        }
    }
    // then, update the stats displays
    processConnections(Object.keys(data.PeerConnections), data);
}

function processConnections(connectionIds, data) {
    const connid = connectionIds.shift();
    if (!connid) return;
    window.setTimeout(processConnections, 0, connectionIds, data);

    const connection = data.PeerConnections[connid];
    const referenceTime = connection.updateLog.length
        ? new Date(connection.updateLog[0].time).getTime()
        : undefined;
    graphs[connid] = {};
    const reportobj = {};
    let values;

    for (reportname in connection.stats) {
        if (reportname.startsWith('Conn-')) {
            return; // legacy stats, no longer supported. Warning is shown above.
        }
    }
    for (reportname in connection.stats) {
        // special casing of computed stats, in particular [a-b]
        if (reportname.indexOf('[') !== -1) {
            t = reportname.split('[');
            comp = '[' + t.pop();
            stat = t.join('');
            stat = stat.substr(0, stat.length - 1);
        } else {
            t = reportname.split('-');
            comp = t.pop();
            stat = t.join('-');
        }

        if (!reportobj.hasOwnProperty(stat)) {
            reportobj[stat] = [];
        }
        values = JSON.parse(connection.stats[reportname].values);
        startTime = new Date(connection.stats[reportname].startTime).getTime();
        endTime = new Date(connection.stats[reportname].endTime).getTime();
        // Individual timestamps were added in crbug.com/1462567 in M117.
        if (connection.stats[stat + '-timestamp']) {
            const timestamps = JSON.parse(connection.stats[stat + '-timestamp'].values);
            values = values.map((currentValue, index) => [timestamps[index], currentValue]);
        } else {
            // Fallback to the assumption that stats were gathered every second.
            values = values.map((currentValue, index) => [startTime + 1000 * index, currentValue]);
        }
        reportobj[stat].push([comp, values, connection.stats[reportname].statsType]);
    }

    Object.keys(reportobj).forEach(reportname => {
        const reports = reportobj[reportname];
        const statsType = reports[0][2];
        // ignore useless graphs
        if (['local-candidate', 'remote-candidate', 'codec', 'stream', 'track'].includes(statsType)) return;

        const series = [];
        series.statsType = statsType;
        const plotBands = [];
        reports.sort().forEach(report => {
            const [name, data, statsType] = report;
            if (name === 'kind' || name === 'mediaType') {
                series.kind = data[0][1];
            }
            if (name === 'trackIdentifier') {
                series.trackIdentifier = data[0][1];
            }
            if (name === 'ssrc') {
                series.ssrc = data[0][1];
            }
            if (name === 'label') { // for datachannels.
                series.label = data[0][1];
            }
            if (name === 'active' && statsType === 'outbound-rtp') {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
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
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
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
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
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
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
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
                'mid', 'rid',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'encoderImplementation', 'decoderImplementation', 'scalabilityMode',
                'scalabilityMode', '[codec]',
                'label', // for datachannels
            ];
            if (statsForLabels.includes(name)) {
                series[name] = data[0][1];
            }
            series.id = reportname;

            if (typeof(data[0][1]) !== 'number') return;
            const ignoredSeries = [
                'timestamp',
                'protocol', 'dataChannelIdentifier',
                'streamIdentifier', 'trackIdentifier',
                'priority', 'port',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'mid', 'rid',
            ];
            if (ignoredSeries.includes(name)) {
                return;
            }

            const hiddenSeries = [
                'bytesReceived', 'bytesSent',
                'headerBytesReceived', 'headerBytesSent',
                'packetsReceived', 'packetsSent',
                'qpSum',
                'framesEncoded', 'framesDecoded', 'totalEncodeTime',
                'lastPacketReceivedTimestamp', 'lastPacketSentTimestamp',
                'remoteTimestamp', 'estimatedPlayoutTimestamp',
                'audioInputLevel', 'audioOutputLevel',
                'totalSamplesDuration', 'totalSamplesReceived',
                'jitterBufferEmittedCount',
            ];
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

            series.push({
                name,
                data,
                visible: !hiddenSeries.includes(name),
                yAxis: secondYAxis.includes(name) ? 1 : 0,
            });
        });

        // Optionally start all graphs at the same point in time.
        if (document.getElementById('useReferenceTime').checked && referenceTime !== undefined) {
            series
                .filter(s => s.data[0].length)
                .map(s => {
                    console.log(s.name, s.data);
                    if (s.data[0] !== referenceTime) {
                        s.data.unshift([referenceTime, undefined]);
                    }
                });
        }

        // TODO: it would be nice to sort the graphs such that same mids go together.
        if (series.length > 0) {
            const container = document.createElement('details');
            if (series.statsType) {
                container.attributes['data-statsType'] = series.statsType;
            }
            containers[connid].graphs.appendChild(container);
            // TODO: keep in sync with
            // https://source.chromium.org/chromium/chromium/src/+/main:content/browser/webrtc/resources/stats_helper.js
            const title = [
                'statsType', 'kind',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'mid', 'rid',
                'label',
                '[codec]',
                'encoderImplementation', 'decoderImplementation',
                'trackIdentifier',
                'id',
            ].filter(key => series[key] !== undefined)
            .map(key => {
                return ({statsType: 'type', trackIdentifier: 'track'}[key] || key) + '=' + JSON.stringify(series[key]);
            }).join(', ');
            const titleElement = document.createElement('summary');
            titleElement.innerText = title;
            container.appendChild(titleElement);

            const d = document.createElement('div');
            d.id = 'chart_' + Date.now();
            d.classList.add('graph');
            container.appendChild(d);
            const graph = new Highcharts.Chart({
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
                    renderTo : d.id,
                },
                series,
            });
            graphs[connid][reportname] = graph;

            // expand the graph when opening
            container.ontoggle = () => container.open && graph.reflow();

            // draw checkbox to turn off everything
            ((reportname, container, graph) => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                container.appendChild(checkbox);
                const label = document.createElement('label');
                label.innerText = 'Turn on/off all data series'
                container.appendChild(label);
                checkbox.onchange = function() {
                    graph.series.forEach(series => {
                        series.setVisible(!checkbox.checked, false);
                    });
                    graph.redraw();
                };
            })(reportname, container, graph);
        }
    });
}

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
