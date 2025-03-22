## Import webrtc-internal dumps
Chrome webrtc-internals page is tremendously useful but lacks the ability to reimport the exported dumps.
My efforts to fix this in chrome were bitrotting in the chromium tracker for two years. But hey, I can just make a web page to do it.
And use a [better library for graphs](http://www.highcharts.com/) that adds the ability to zoom into regions of interest.

## What do all these parameters mean?

I teamed up with [Tsahi Levent-Levi](https://bloggeek.me/) to describe the parameters from webrtc-internals as a series of blog posts:
* [Everything you wanted to know about webrtc-internals and getStats](https://bloggeek.me/webrtc-internals/)

[See also the 2017 version of that](http://testrtc.com/webrtc-internals-parameters/)

## License
MIT

Note that the (awesome) Highcharts library used for plots may need a license. See http://shop.highsoft.com/faq/non-commercial
