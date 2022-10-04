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

function createLegacyCandidateTable(container, stun) {
    // for ice candidates
    const head = document.createElement('tr');
    [
        'Local address',
        'Local type',
        'Local id',
        'Remote address',
        'Remote type',
        'Remote id',
        'Requests sent', 'Responses received',
        'Requests received', 'Responses sent',
        'Active Connection',
    ].forEach((text) => {
        const el = document.createElement('td');
        el.innerText = text;
        head.appendChild(el);
    });
    container.appendChild(head);

    for (t in stun) {
        const row = document.createElement('tr');
        [
            'googLocalAddress', 'googLocalCandidateType', 'localCandidateId',
            'googRemoteAddress', 'googRemoteCandidateType', 'remoteCandidateId',
            'requestsSent', 'responsesReceived',
            'requestsReceived', 'responsesSent',
            'googActiveConnection', /* consentRequestsSent, */
        ].forEach((id) => {
            const el = document.createElement('td');
            el.innerText = stun[t][id];
            row.appendChild(el);
        });
        container.appendChild(row);
    }
}

function createSpecCandidateTable(container, allStats) {
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
        'priority',
        'interface',
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
            // console.log('PAIR', p, pair);

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
                row.appendChild(el);

                el = document.createElement('td');
                el.innerText = candidate.networkType || 'unknown';
                row.appendChild(el);

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

    const graphs = document.createElement('div');
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

    const columns = ['request_id', 'origin', 'pid', 'rid', 'audio', 'video', 'audio_track_info', 'video_track_info', 'error', 'error_message'];
    const displayNames = {
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
    } else if (event.type === 'iceConnectionStateChange') {
        // Legacy variant, probably broken by now since the values changed.
        switch(event.value) {
        case 'ICEConnectionStateConnected':
        case 'ICEConnectionStateCompleted':
        case 'kICEConnectionStateConnected':
        case 'kICEConnectionStateCompleted':
            row.style.backgroundColor = 'green';
            break;
        case 'ICEConnectionStateFailed':
        case 'kICEConnectionStateFailed':
            row.style.backgroundColor = 'red';
            break;
        }
    }

    if (event.type === 'icecandidate' || event.type === 'addIceCandidate') {
        if (event.value && event.value.candidate) {
            const parts = event.value.split(',')[2].trim().split(' ');
            if (parts && parts.length >= 9 && parts[7] === 'typ') {
                details.classList.add(parts[8]);
            }
        }
    } else if (event.type === 'onIceCandidate' || event.type === 'addIceCandidate') {
        // Legacy variant.
        if (event.value && event.value.candidate) {
            const parts = event.value.split(',')[2].trim().split(' ');
            if (parts && parts.length >= 9 && parts[7] === 'typ') {
                details.classList.add(parts[8]);
            }
        }
    }
    table.appendChild(row);
}

const graphs = {};
const containers = {};
function importUpdatesAndStats(data) {
    document.getElementById('userAgent').innerText = data.UserAgent;

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
        const stun = {};
        for (reportname in connection.stats) {
            if (reportname.startsWith('Conn-')) {
                let t = reportname.split('-');
                const comp = t.pop();
                t = t.join('-');
                if (!stun[t]) stun[t] = {};
                const stats = JSON.parse(connection.stats[reportname].values);
                switch(comp) {
                case 'requestsSent':
                case 'consentRequestsSent':
                case 'responsesSent':
                case 'requestsReceived':
                case 'responsesReceived':
                case 'localCandidateId':
                case 'remoteCandidateId':
                case 'googLocalAddress':
                case 'googRemoteAddress':
                case 'googLocalCandidateType':
                case 'googRemoteCandidateType':
                case 'googActiveConnection':
                    //console.log(t, comp, connection.stats[reportname]);
                    stun[t][comp] = stats[stats.length - 1];
                    break;
                default:
                    //console.log(reportname, comp, stats);
                }
            }
        }

        if (Object.keys(stun).length === 0) {
            // spec-stats. A bit more complicated... we need the transport and then the candidate pair and the local/remote candidates.
            createSpecCandidateTable(containers[connid].candidates, connection.stats);
        } else {
            createLegacyCandidateTable(containers[connid].candidates, stun);
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
        values = values.map((currentValue, index) => [startTime + 1000 * index, currentValue]);
        reportobj[stat].push([comp, values, connection.stats[reportname].statsType]);
    }


    // sort so we get a more useful order of graphs:
    // * ssrcs
    // * bwe
    // * everything else alphabetically
    let names = Object.keys(reportobj);
    const ssrcs = names.filter(name => name.startsWith('ssrc_')).sort((a, b) => { // sort by send/recv and ssrc
        const aParts = a.split('_');
        const bParts = b.split('_');
        if (aParts[2] === bParts[2]) {
            return parseInt(aParts[1], 10) - parseInt(bParts[1], 10);
        } else if (aParts[2] === 'send') return -1;
        return 1;
    });
    const bwe = names.filter(name => name === 'bweforvideo');
    names = names.filter(name => !name.startsWith('ssrc_') && name !== 'bweforvideo');
    names = ssrcs.concat(bwe, names);
    names.forEach(reportname => {
        const reports = reportobj[reportname];
        const statsType = reports[0][2];
        // ignore useless graphs
        if (['local-candidate', 'remote-candidate', 'codec'].includes(statsType)) return;
        if (reportname.startsWith('Cand-') || reportname.startsWith('Channel')) return;
        if (reportname.startsWith('RTCIceCandidate_')) return;
        if (reportname.startsWith('RTCCodec_')) return;

        const series = [];
        series.statsType = statsType;
        const plotBands = [];
        reports.sort().forEach(report => {
            if (report[0] === 'kind' || report[0] === 'mediaType') {
                series.kind = report[1][0][1];
            }
            if (report[0] === 'googTrackId') {
                series.trackId = report[1][0][1];
            }
            if (report[0] === 'ssrc') {
                series.ssrc = report[1][0][1];
            }
            if (report[0] === 'label') { // for datachannels.
                series.label = report[1][0][1];
            }
            if (report[0] === 'active' && report[2] === 'outbound-rtp') {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
                report[1].filter((el, index, values) => {
                    return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
                }).forEach((item, index, values) => {
                    if (item[1] === true) {
                        return;
                    }
                    plotBands.push({
                        from: item[0],
                        to: (values[index + 1] || [])[0]
                    });
                });
                return;
            }
            if (['encoderImplementation', 'decoderImplementation'].includes(report[0])) {
                series[report[0]] = report[1][0][1];
            }
            if (typeof(report[1][0][1]) !== 'number') return;
            if (report[0] === 'bytesReceived' || report[0] === 'bytesSent') return;
            if (report[0] === 'headerBytesReceived' || report[0] === 'headerBytesSent') return;
            if (report[0] === 'packetsReceived' || report[0] === 'packetsSent') return;
            if (report[0] === 'mid') {
                series.mid = report[1][0][1];
                return;
            }
            if (report[0]  === 'rid') {
                series.rid = report[1][0][1];
                return;
            }
            if (report[0] === 'googCaptureStartNtpTimeMs') return;

            if (report[0] === 'bitsReceivedPerSecond' || report[0] === 'bitsSentPerSecond') { // convert to kbps
                report[0] = 'k' + report[0];
                report[1] = report[1].map(el => [el[0], Math.floor(el[1] / 1000)]);
            }

            const hiddenSeries = [
                'qpSum', 'estimatedPlayoutTimestamp',
                'framesEncoded', 'framesDecoded',
                'lastPacketReceivedTimestamp',
                'audioInputLevel', 'audioOutputLevel',
                'googEchoCancellationEchoDelayStdDev',
                'totalSamplesDuration',
                'googDecodingCTN', 'googDecodingCNG', 'googDecodingNormal',
                'googDecodingPLCCNG', 'googDecodingCTSG', 'googDecodingMuted',
                'priority', 'port',
            ];

            series.push({
                name: report[0],
                visible: hiddenSeries.indexOf(report[0]) === -1,
                data: report[1]
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
        if (series.length > 0) {
            const container = document.createElement('details');
            container.open = reportname.startsWith('ssrc_') ||
                reportname === 'bweforvideo' ||
                (reportname.startsWith('Conn-') && reportname.indexOf('-1-0') !== -1);
            containers[connid].graphs.appendChild(container);
            //document.getElementById('container').appendChild(container);

            const title = [
                series.statsType ? 'type=' + series.statsType : '',
                series.kind ? 'media kind=' + series.kind : '',
                series.ssrc !== undefined ? 'ssrc=' + series.ssrc.toString(16) : '',
                series.mid !== undefined ? 'mid=' + series.mid : '',
                series.rid !== undefined ? 'rid=' + series.rid : '',
                series.trackId ? 'trackId=' + series.trackId : '',
                series.label ? 'label=' + series.label : '',
                series.encoderImplementation ? 'encoderImplementation="' + series.encoderImplementation + '"': '',
                series.decoderImplementation ? 'decoderImplementation="' + series.decoderImplementation + '"': '',
                'id=' + reportname,
            ].filter(s => s !== '').join(' ');
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
                yAxis: {
                    min: series.kind ? 0 : undefined
                },
                chart: {
                    zoomType: 'x',
                    renderTo : d.id,
                },
                series: series
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
