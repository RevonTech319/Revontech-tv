package com.revontech.tv.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.drm.DefaultDrmSessionManager
import androidx.media3.exoplayer.drm.FrameworkMediaDrm
import androidx.media3.exoplayer.drm.LocalMediaDrmCallback
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.upstream.DefaultAllocator
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy

/**
 * Robust Media3-based player engine for RevonTV.
 * Handles HLS and DASH streams with optional ClearKey DRM.
 * Includes watchdog stall detection for auto-recovery.
 */
@OptIn(UnstableApi::class)
class TwevePlayerEngine(private val context: Context) {

    companion object {
        private const val TAG = "TwevePlayerEngine"
    }

    var player: ExoPlayer? = null
        private set

    var onStateChanged: ((Int) -> Unit)? = null
    var onError: ((PlaybackException) -> Unit)? = null
    var onStallDetected: (() -> Unit)? = null

    private var currentUrl: String? = null
    private var currentType: String = "hls"
    private var currentKid: String? = null
    private var currentKey: String? = null

    private val handler = Handler(Looper.getMainLooper())
    private var lastPosition = -1L
    private var stallCount = 0

    private val watchdog = object : Runnable {
        override fun run() {
            val p = player ?: return
            if (p.playWhenReady && (p.playbackState == Player.STATE_READY || p.playbackState == Player.STATE_BUFFERING)) {
                val pos = p.currentPosition
                if (pos == lastPosition && pos >= 0) {
                    stallCount++
                    val threshold = if (currentType.equals("dash", true) || currentUrl?.contains(".mpd", true) == true) 10 else 4
                    if (stallCount >= threshold) {
                        stallCount = 0
                        Log.w(TAG, "Stall detected at position $pos")
                        onStallDetected?.invoke()
                    }
                } else {
                    stallCount = 0
                    lastPosition = pos
                }
            } else {
                stallCount = 0
            }
            handler.postDelayed(this, 1500)
        }
    }

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_READY) {
                stallCount = 0
                lastPosition = -1
            }
            onStateChanged?.invoke(state)
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.e(TAG, "Player error: ${error.errorCodeName}", error)
            onError?.invoke(error)
        }
    }

    /**
     * Create the player, build the media source, and start playback.
     */
    fun startPlayback(url: String, type: String = "hls", kid: String? = null, key: String? = null) {
        release() // Always start fresh

        currentUrl = url
        currentType = type
        currentKid = kid
        currentKey = key

        Log.d(TAG, "startPlayback: type=$type url=$url kid=${kid?.take(8)}...")

        // Cookie management for session-based streams
        if (CookieHandler.getDefault() == null) {
            val cm = CookieManager()
            cm.setCookiePolicy(CookiePolicy.ACCEPT_ORIGINAL_SERVER)
            CookieHandler.setDefault(cm)
        }

        // HTTP factory with CDN-bypass headers
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(15_000)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(mapOf(
                "Referer" to "https://www.google.com/",
                "Origin" to "https://www.google.com/"
            ))

        val dataSourceFactory = DefaultDataSource.Factory(context, httpFactory)

        // Determine stream format
        val isDash = type.equals("dash", true) || type.equals("shaka", true) || url.contains(".mpd", true)
        val isHls = !isDash

        // Build MediaItem
        val mimeType = if (isDash) MimeTypes.APPLICATION_MPD else MimeTypes.APPLICATION_M3U8
        val mediaItemBuilder = MediaItem.Builder()
            .setUri(url)
            .setMimeType(mimeType)

        // DRM setup
        var drmManager: DefaultDrmSessionManager? = null
        if (!kid.isNullOrBlank() && !key.isNullOrBlank()) {
            try {
                val kidB64 = toBase64Url(kid.trim())
                val keyB64 = toBase64Url(key.trim())
                Log.d(TAG, "ClearKey DRM: kid=$kidB64 key=$keyB64")

                val json = """{"keys":[{"kty":"oct","k":"$keyB64","kid":"$kidB64"}],"type":"temporary"}"""
                val callback = LocalMediaDrmCallback(json.toByteArray(Charsets.UTF_8))

                drmManager = DefaultDrmSessionManager.Builder()
                    .setUuidAndExoMediaDrmProvider(C.CLEARKEY_UUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
                    .setMultiSession(true)
                    .build(callback)

                mediaItemBuilder.setDrmConfiguration(
                    MediaItem.DrmConfiguration.Builder(C.CLEARKEY_UUID).build()
                )
            } catch (e: Exception) {
                Log.e(TAG, "DRM setup failed", e)
            }
        }

        val mediaItem = mediaItemBuilder.build()

        // Build MediaSource
        val mediaSource: MediaSource = if (isDash) {
            val factory = DashMediaSource.Factory(dataSourceFactory)
            if (drmManager != null) factory.setDrmSessionManagerProvider { drmManager }
            factory.createMediaSource(mediaItem)
        } else {
            val factory = HlsMediaSource.Factory(dataSourceFactory)
                .setAllowChunklessPreparation(true)
            factory.createMediaSource(mediaItem)
        }

        // Build load control
        val loadControl = DefaultLoadControl.Builder()
            .setAllocator(DefaultAllocator(true, 16 * 1024))
            .setBufferDurationsMs(20_000, 60_000, 2_500, 5_000)
            .setTargetBufferBytes(C.LENGTH_UNSET)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        // Build default media source factory for the ExoPlayer builder
        val msFactory = DefaultMediaSourceFactory(dataSourceFactory)
        if (drmManager != null) msFactory.setDrmSessionManagerProvider { drmManager }

        // Create ExoPlayer
        val exo = ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .setMediaSourceFactory(msFactory)
            .build()

        exo.addListener(listener)
        exo.setMediaSource(mediaSource)
        exo.prepare()
        exo.playWhenReady = true

        player = exo
        Log.d(TAG, "Player created and playing. player=$exo")

        // Start watchdog
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, 3000)
    }

    fun reload() {
        val url = currentUrl ?: return
        startPlayback(url, currentType, currentKid, currentKey)
    }

    fun play() { player?.playWhenReady = true }
    fun pause() { player?.playWhenReady = false }
    fun currentPosition(): Long = player?.currentPosition ?: 0L

    fun release() {
        handler.removeCallbacks(watchdog)
        player?.removeListener(listener)
        player?.release()
        player = null
        stallCount = 0
        lastPosition = -1
    }

    /**
     * Convert a kid/key string to Base64URL format.
     * Handles hex strings (32 or 16 chars), UUID strings, and passthrough Base64.
     */
    private fun toBase64Url(input: String): String {
        val stripped = input.replace("-", "").replace(" ", "")

        // Check if it's hex (32 or 16 hex chars)
        if ((stripped.length == 32 || stripped.length == 16) && stripped.matches(Regex("^[0-9A-Fa-f]+$"))) {
            val bytes = ByteArray(stripped.length / 2) { i ->
                ((Character.digit(stripped[i * 2], 16) shl 4) + Character.digit(stripped[i * 2 + 1], 16)).toByte()
            }
            return android.util.Base64.encodeToString(bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
        }

        // Already Base64 — just normalize to URL-safe
        return input.replace('+', '-').replace('/', '_').trimEnd('=')
    }
}
