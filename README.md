## Import webrtc-internal dumps
Chrome webrtc-internals page is tremendously useful but lacks the ability to reimport the exported dumps.
My efforts to fix this in chrome were bitrotting in the chromium tracker for two years. But hey, I can just make a web page to do it. And use a [better library for graphs](http://www.highcharts.com/) that adds the ability to zoom into regions of interest.

## What do all these parameters mean?

I teamed up with Tsahi to describe the parameters from webrtc-internals [as a series of blog posts](http://testrtc.com/webrtc-internals-parameters/)

## Highlighting sections in a graph
There is a simple API to highlight portions of the graph.
Just use that hash in the URL to specify a connection id, start time, stop time and label. E.g.:
```
#conn-id PLUS start1 PLUS last1 PLUS label1 SEMICOLON start2 ...
#8100-6+1+3+foo;8200-5+1+7+bar;...
```

## License
MIT

Note that the (awesome) Highcharts library used for plots may need a license. See http://shop.highsoft.com/faq/non-commercial
