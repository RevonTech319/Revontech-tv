package com.revontech.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.ui.PlayerView
import com.revontech.tv.player.TwevePlayerEngine
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.firestore.FirebaseFirestore
import org.json.JSONObject
import java.util.*

class PlayerActivity : AppCompatActivity() {

    private lateinit var playerView: PlayerView
    private lateinit var loader: ProgressBar
    private lateinit var btnBack: View
    private lateinit var layoutTopBar: View
    private lateinit var tvTrialCountdown: TextView
    private lateinit var paywallOverlay: View
    private lateinit var btnPaywallSubscribe: Button
    private lateinit var btnPaywallBack: Button

    private lateinit var btnSettings: View
    private lateinit var btnVolume: View
    private lateinit var imgVolume: android.widget.ImageView
    private lateinit var settingsOverlay: View
    private lateinit var containerAudioTracks: android.view.ViewGroup
    private lateinit var containerTextTracks: android.view.ViewGroup

    private var playerEngine: TwevePlayerEngine? = null
    private var channel: Channel? = null
    
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    private var tweveDb: FirebaseDatabase? = null

    private var isPremium = false
    private var cdnToken = ""
    
    // Trial timer properties
    private var trialLeft = 30
    private val timerHandler = Handler(Looper.getMainLooper())
    private val trialRunnable = object : Runnable {
        override fun run() {
            if (trialLeft <= 1) {
                // Trial expired! Show paywall and stop player
                trialLeft = 0
                tvTrialCountdown.text = "0s"
                showPaywallScreen()
            } else {
                trialLeft--
                tvTrialCountdown.text = "${trialLeft}s"
                timerHandler.postDelayed(this, 1000)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Landscape TV Playing immersive mode
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        
        window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_player)

        playerView = findViewById(R.id.player_view)
        layoutTopBar = findViewById(R.id.layout_top_bar)
        loader = findViewById(R.id.player_loader)
        btnBack = findViewById(R.id.btn_player_back)
        tvTrialCountdown = findViewById(R.id.tv_trial_countdown)
        paywallOverlay = findViewById(R.id.paywall_overlay)
        btnPaywallSubscribe = findViewById(R.id.btn_paywall_subscribe)
        btnPaywallBack = findViewById(R.id.btn_paywall_back)

        btnSettings = findViewById(R.id.btn_player_settings)
        btnVolume = findViewById(R.id.btn_player_volume)
        imgVolume = findViewById(R.id.img_player_volume)
        settingsOverlay = findViewById(R.id.settings_overlay)
        containerAudioTracks = findViewById(R.id.container_audio_tracks)
        containerTextTracks = findViewById(R.id.container_text_tracks)

        // Dynamically hide/show the top overlay (Rudi and LIVE text) with the player controllers
        playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            layoutTopBar.visibility = visibility
            if (visibility == View.GONE) {
                settingsOverlay.visibility = View.GONE
            }
        })

        btnVolume.setOnClickListener {
            val p = playerEngine?.player
            if (p != null) {
                if (p.volume > 0f) {
                    p.volume = 0f
                    imgVolume.setImageResource(android.R.drawable.ic_lock_silent_mode)
                    Toast.makeText(this, "Sauti imezimwa", Toast.LENGTH_SHORT).show()
                } else {
                    p.volume = 1f
                    imgVolume.setImageResource(android.R.drawable.ic_lock_silent_mode_off)
                    Toast.makeText(this, "Sauti imewashwa", Toast.LENGTH_SHORT).show()
                }
            }
        }

        btnSettings.setOnClickListener {
            if (settingsOverlay.visibility == View.VISIBLE) {
                settingsOverlay.visibility = View.GONE
            } else {
                settingsOverlay.visibility = View.VISIBLE
                updateTracksSelectionMenu()
            }
        }

        channel = intent.getSerializableExtra("channel") as? Channel

        if (channel == null || channel?.url.isNullOrEmpty()) {
            Toast.makeText(this, "Anwani ya kituo haikupatikana!", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        btnBack.setOnClickListener {
            onBackPressedDispatcher.onBackPressed()
        }

        btnPaywallBack.setOnClickListener {
            onBackPressedDispatcher.onBackPressed()
        }

        btnPaywallSubscribe.setOnClickListener {
            // Direct user to payment activity fragment flow
            val intent = Intent(this, MainActivity::class.java).apply {
                putExtra("route", "payment")
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(intent)
            finish()
        }

        initializeTweveStreamDB()
        checkSubscriptionAndPlay()
    }

    private fun initializeTweveStreamDB() {
        try {
            val appName = "tweveStream"
            val secondaryApp = try {
                FirebaseApp.getInstance(appName)
            } catch (e: Exception) {
                val options = FirebaseOptions.Builder()
                    .setApiKey("AIzaSyBesKPIz9lw2Z8g8SYa4S7M-RxSCmYvbVs")
                    .setApplicationId("1:dummy:android:dummy")
                    .setProjectId("tweve-stream")
                    .setDatabaseUrl("https://tweve-stream-default-rtdb.firebaseio.com")
                    .build()
                FirebaseApp.initializeApp(this, options, appName)
            }
            tweveDb = FirebaseDatabase.getInstance(secondaryApp)
        } catch (e: Exception) {
            android.util.Log.e("PlayerActivity", "RTDB secondary init failed: ${e.message}")
        }
    }

    private fun checkSubscriptionAndPlay() {
        val currentUser = auth.currentUser

        // Free channel check — always allowed
        val isFree = channel!!.is_free
        if (isFree) {
            fetchTokenAndStartPlayback()
            return
        }

        // Not logged in — show paywall
        if (currentUser == null) {
            showPaywallScreen()
            return
        }

        // Admin bypass — requires existence of /admins/{uid} document in Firestore
        // (NOT email pattern — that was a security hole)
        firestore.collection("admins").document(currentUser.uid)
            .get()
            .addOnSuccessListener { adminDoc ->
                if (adminDoc.exists()) {
                    isPremium = true
                    fetchTokenAndStartPlayback()
                } else {
                    // Not admin — proceed with normal subscription check
                    checkUserSubscription(currentUser)
                }
            }
            .addOnFailureListener {
                // On error, treat as non-admin (most users) and check subscription
                checkUserSubscription(currentUser)
            }
    }

    private fun checkUserSubscription(currentUser: com.google.firebase.auth.FirebaseUser) {
        // Query Firestore active subscriptions
        loader.visibility = View.VISIBLE
        firestore.collection("subscriptions")
            .whereEqualTo("user_id", currentUser.uid)
            .get()
            .addOnSuccessListener { documents ->
                var activeSubscriptionFound = false
                val now = Date()

                for (doc in documents) {
                    val status = doc.getString("status") ?: "pending"
                    val expiryDate = parseExpiresAt(doc)
                    
                    if (status == "active") {
                        if (expiryDate == null || expiryDate.after(now)) {
                            activeSubscriptionFound = true
                            break
                        }
                    }
                }

                isPremium = activeSubscriptionFound
                
                if (isPremium) {
                    fetchTokenAndStartPlayback()
                } else {
                    // Trial timer start!
                    tvTrialCountdown.visibility = View.VISIBLE
                    tvTrialCountdown.text = "${trialLeft}s"
                    timerHandler.postDelayed(trialRunnable, 1000)
                    fetchTokenAndStartPlayback()
                }
            }
            .addOnFailureListener { e ->
                android.util.Log.e("PlayerActivity", "Sub check failed: ${e.message}")
                // Fallback: start trial countdown anyway as safety
                tvTrialCountdown.visibility = View.VISIBLE
                tvTrialCountdown.text = "${trialLeft}s"
                timerHandler.postDelayed(trialRunnable, 1000)
                fetchTokenAndStartPlayback()
            }
    }

    private fun fetchTokenAndStartPlayback() {
        loader.visibility = View.VISIBLE
        
        // 1. Try local Firestore tokens collection FIRST (Admin Panel control)
        firestore.collection("tokens")
            .get()
            .addOnSuccessListener { tokenSnap ->
                var tokenValue = ""
                if (tokenSnap != null && !tokenSnap.isEmpty) {
                    val allTokens = tokenSnap.documents.mapNotNull { doc ->
                        val value = doc.getString("value")
                        val updatedAt = doc.getTimestamp("updated_at")?.toDate() ?: Date(0)
                        if (value != null) Pair(value, updatedAt) else null
                    }
                    if (allTokens.isNotEmpty()) {
                        val sorted = allTokens.sortedByDescending { it.second }
                        tokenValue = sorted[0].first
                    }
                }
                
                if (tokenValue.isNotEmpty()) {
                    cdnToken = tokenValue
                    android.util.Log.d("PlayerActivity", "Token found in Firestore")
                    startPlayback()
                } else {
                    fallbackToRTDB()
                }
            }
            .addOnFailureListener { e ->
                android.util.Log.e("PlayerActivity", "Firestore token fetch failed: ${e.message}")
                fallbackToRTDB()
            }
    }

    private fun fallbackToRTDB() {
        if (tweveDb != null) {
            tweveDb!!.getReference("tokens/global")
                .get()
                .addOnSuccessListener { rtdbSnap ->
                    val tokenValue = rtdbSnap.child("value").getValue(String::class.java)
                    if (!tokenValue.isNullOrEmpty()) {
                        cdnToken = tokenValue
                        android.util.Log.d("PlayerActivity", "Token found in RTDB")
                        startPlayback()
                    } else {
                        useHardcodedToken()
                    }
                }
                .addOnFailureListener { e ->
                    android.util.Log.e("PlayerActivity", "RTDB token fetch failed: ${e.message}")
                    useHardcodedToken()
                }
        } else {
            useHardcodedToken()
        }
    }

    private fun useHardcodedToken() {
        android.util.Log.d("PlayerActivity", "Using fallback hardcoded token")
        cdnToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3Nzc4NDUwMjgsInNpcCI6IjMuMTcyLjUuNDcifQ.snuae7n7AChoZmOaWPh-Pd4RdyC40ZGkbyXi5rmyu1smaFnKHwSaAC4jx_dWPx-06Ed8wEwe7CqvoukqgV_NmA"
        startPlayback()
    }

    private fun showPaywallScreen() {
        timerHandler.removeCallbacks(trialRunnable)
        tvTrialCountdown.visibility = View.GONE
        loader.visibility = View.GONE
        
        // Fully release player
        releasePlayer()
        
        paywallOverlay.visibility = View.VISIBLE
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun startPlayback() {
        if (isDestroyed || isFinishing) return
        loader.visibility = View.VISIBLE

        // Parse stream type
        val streamType = channel?.link_type?.lowercase() ?: ""
        val urlString = channel?.url ?: ""
        val isDash = streamType == "dash" || streamType == "shaka" || urlString.contains(".mpd", true)

        // Match website exactly: Strip any embedded /tok_.../ and apply CDN token ONLY for DASH streams
        var cleanBase = (channel?.url ?: "").replace(Regex("/tok_[^/]+"), "")
        cleanBase = cleanBase.replace(Regex("[?&]cdntoken=[^&#]*"), "")
            .replace("?&", "?")
            .replace(Regex("[?&]$"), "")

        val playUrl = if (isDash && cdnToken.isNotEmpty()) {
            val connector = if (cleanBase.contains("?")) "&" else "?"
            "$cleanBase${connector}cdntoken=$cdnToken"
        } else {
            cleanBase
        }

        // Extract RAW Kid and Key
        var rawKid: String? = null
        var rawKey: String? = null

        if (!channel!!.kid.isNullOrEmpty() && !channel!!.key.isNullOrEmpty()) {
            rawKid = channel!!.kid
            rawKey = channel!!.key
        } else if (!channel!!.drmKid.isNullOrEmpty() && !channel!!.drmKey.isNullOrEmpty()) {
            rawKid = channel!!.drmKid
            rawKey = channel!!.drmKey
        } else {
            val clearKeyString = if (!channel!!.drmClearKey.isNullOrEmpty()) channel!!.drmClearKey else channel!!.drm_clear_key
            if (!clearKeyString.isNullOrEmpty()) {
                if (clearKeyString.trim().startsWith("{")) {
                    try {
                        val json = JSONObject(clearKeyString)
                        if (json.has("keys")) {
                            val keysArr = json.getJSONArray("keys")
                            if (keysArr.length() > 0) {
                                val kObj = keysArr.getJSONObject(0)
                                if (kObj.has("kid") && kObj.has("k")) {
                                    rawKid = kObj.getString("kid")
                                    rawKey = kObj.getString("k")
                                }
                            }
                        } else {
                            val keys = json.keys()
                            if (keys.hasNext()) {
                                rawKid = keys.next()
                                rawKey = json.getString(rawKid!!)
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("PlayerActivity", "DRM JSON parse error: ${e.message}")
                    }
                } else if (clearKeyString.contains(":")) {
                    val pairs = clearKeyString.split(",")
                    val parts = pairs[0].split(":")
                    if (parts.size >= 2) {
                        rawKid = parts[0]
                        rawKey = parts[1]
                    }
                }
            }
        }

        // Release any previous engine
        releasePlayer()

        // Create and configure the engine
        var viewCountRecorded = false
        val engine = TwevePlayerEngine(this)

        engine.onStateChanged = { state ->
            runOnUiThread {
                if (isDestroyed || isFinishing) return@runOnUiThread
                when (state) {
                    androidx.media3.common.Player.STATE_BUFFERING -> {
                        loader.visibility = View.VISIBLE
                    }
                    androidx.media3.common.Player.STATE_READY -> {
                        loader.visibility = View.GONE
                        if (!viewCountRecorded) {
                            viewCountRecorded = true
                            incrementViewCount()
                        }
                    }
                    else -> {
                        loader.visibility = View.GONE
                    }
                }
            }
        }

        engine.onError = { error ->
            runOnUiThread {
                if (isDestroyed || isFinishing) return@runOnUiThread
                loader.visibility = View.GONE
                Toast.makeText(this, "Hitilafu ya uchezaji: ${error.message}", Toast.LENGTH_LONG).show()
                android.util.Log.e("PlayerActivity", "Playback error: ", error)
            }
        }

        engine.onStallDetected = {
            runOnUiThread {
                if (isDestroyed || isFinishing) return@runOnUiThread
                android.util.Log.w("PlayerActivity", "Stall detected! Reloading...")
                playerEngine?.reload()
            }
        }

        playerEngine = engine

        // Start playback — this creates the Media3 player internally
        engine.startPlayback(
            url = playUrl,
            type = if (isDash) "dash" else "hls",
            kid = rawKid,
            key = rawKey
        )

        // Bind the created player to the view AFTER startPlayback creates it
        playerView.player = engine.player
        android.util.Log.d("PlayerActivity", "PlayerView bound to player: ${engine.player}")
    }

    private fun releasePlayer() {
        playerView.player = null
        playerEngine?.release()
        playerEngine = null
    }

    override fun onStart() {
        super.onStart()
        playerEngine?.play()
    }

    override fun onStop() {
        super.onStop()
        playerEngine?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        timerHandler.removeCallbacks(trialRunnable)
        releasePlayer()
    }

    private fun incrementViewCount() {
        val id = channel?.id
        if (!id.isNullOrEmpty()) {
            firestore.collection("channels").document(id)
                .update("views", com.google.firebase.firestore.FieldValue.increment(1))
                .addOnFailureListener {
                    // Ignore silently if views field doesn't exist yet or permission denied
                }
        }
    }

    private fun parseExpiresAt(doc: com.google.firebase.firestore.DocumentSnapshot): Date? {
        val expiresAtObj = doc.get("expires_at")
        if (expiresAtObj is com.google.firebase.Timestamp) {
            return expiresAtObj.toDate()
        }
        val dateStr = expiresAtObj?.toString()
        if (!dateStr.isNullOrEmpty()) {
            val formats = arrayOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                "yyyy-MM-dd'T'HH:mm:ssZ"
            )
            for (format in formats) {
                try {
                    val sdf = java.text.SimpleDateFormat(format, Locale.US)
                    if (format.endsWith("'Z'")) {
                        sdf.timeZone = TimeZone.getTimeZone("UTC")
                    }
                    val parsed = sdf.parse(dateStr)
                    if (parsed != null) return parsed
                } catch (e: Exception) {
                    // Try next format
                }
            }
        }
        return null
    }

    private fun updateTracksSelectionMenu() {
        val p = playerEngine?.player ?: return
        val tracks = p.currentTracks

        containerAudioTracks.removeAllViews()
        containerTextTracks.removeAllViews()

        // 1. Populate audio tracks
        var audioTrackCount = 0
        for (group in tracks.groups) {
            if (group.type == androidx.media3.common.C.TRACK_TYPE_AUDIO) {
                val trackGroup = group.mediaTrackGroup
                for (i in 0 until trackGroup.length) {
                    val format = trackGroup.getFormat(i)
                    val lang = format.language ?: "unknown"
                    val label = "${format.label ?: lang.uppercase(Locale.getDefault())} (${format.bitrate / 1000} kbps)"
                    val isSelected = group.isTrackSelected(i)

                    val btn = Button(this, null, 0, androidx.appcompat.R.style.Widget_AppCompat_Button_Borderless).apply {
                        text = if (isSelected) "✓ $label" else label
                        setTextColor(if (isSelected) android.graphics.Color.YELLOW else android.graphics.Color.WHITE)
                        isAllCaps = false
                        textSize = 12f
                        setPadding(20, 10, 20, 10)
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
                        setOnClickListener {
                            p.trackSelectionParameters = p.trackSelectionParameters
                                .buildUpon()
                                .setOverrideForType(
                                    androidx.media3.common.TrackSelectionOverride(trackGroup, i)
                                )
                                .build()
                            settingsOverlay.visibility = View.GONE
                        }
                    }
                    containerAudioTracks.addView(btn)
                    audioTrackCount++
                }
            }
        }
        if (audioTrackCount == 0) {
            val tv = TextView(this).apply {
                text = "Wimbo chaguomsingi wa sauti"
                setTextColor(android.graphics.Color.GRAY)
                textSize = 12f
                setPadding(20, 10, 20, 10)
            }
            containerAudioTracks.addView(tv)
        }

        // 2. Populate text (subtitle) tracks
        var textTrackCount = 0
        val isAnyTextSelected = tracks.groups.any { it.type == androidx.media3.common.C.TRACK_TYPE_TEXT && it.isSelected }
        val btnOff = Button(this, null, 0, androidx.appcompat.R.style.Widget_AppCompat_Button_Borderless).apply {
            text = if (!isAnyTextSelected) "✓ Zima Manukuu" else "Zima Manukuu"
            setTextColor(if (!isAnyTextSelected) android.graphics.Color.YELLOW else android.graphics.Color.WHITE)
            isAllCaps = false
            textSize = 12f
            setPadding(20, 10, 20, 10)
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
            setOnClickListener {
                p.trackSelectionParameters = p.trackSelectionParameters
                    .buildUpon()
                    .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, true)
                    .build()
                settingsOverlay.visibility = View.GONE
            }
        }
        containerTextTracks.addView(btnOff)

        for (group in tracks.groups) {
            if (group.type == androidx.media3.common.C.TRACK_TYPE_TEXT) {
                val trackGroup = group.mediaTrackGroup
                for (i in 0 until trackGroup.length) {
                    val format = trackGroup.getFormat(i)
                    val lang = format.language ?: "unknown"
                    val label = format.label ?: lang.uppercase(Locale.getDefault())
                    val isSelected = group.isTrackSelected(i)

                    val btn = Button(this, null, 0, androidx.appcompat.R.style.Widget_AppCompat_Button_Borderless).apply {
                        text = if (isSelected) "✓ $label" else label
                        setTextColor(if (isSelected) android.graphics.Color.YELLOW else android.graphics.Color.WHITE)
                        isAllCaps = false
                        textSize = 12f
                        setPadding(20, 10, 20, 10)
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
                        setOnClickListener {
                            p.trackSelectionParameters = p.trackSelectionParameters
                                .buildUpon()
                                .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, false)
                                .setOverrideForType(
                                    androidx.media3.common.TrackSelectionOverride(trackGroup, i)
                                )
                                .build()
                            settingsOverlay.visibility = View.GONE
                        }
                    }
                    containerTextTracks.addView(btn)
                    textTrackCount++
                }
            }
        }
    }
}
