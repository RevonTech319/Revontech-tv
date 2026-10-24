package com.revontech.tv

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.cardview.widget.CardView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.textfield.TextInputEditText
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.*
import java.util.concurrent.TimeUnit

class PaymentFragment : Fragment() {

    private lateinit var db: FirebaseFirestore
    private lateinit var auth: FirebaseAuth

    private lateinit var rvPlans: RecyclerView

    // Overlays
    private lateinit var waitingOverlay: View
    private lateinit var successOverlay: View
    private lateinit var failureOverlay: View
    private lateinit var tvWaitingCountdown: TextView
    private lateinit var btnCancelWaiting: Button
    private lateinit var btnSuccessOk: Button
    private lateinit var btnFailureRetry: Button

    private val plansList = mutableListOf<PlanItem>()
    private lateinit var adapter: PlansAdapter
    private var selectedPlan: PlanItem? = null

    // Gateway configs
    private var activeGateway = "snippe"
    private var palmpesaToken = "VZbWXuR9BBSeCK3zEW6BWAnLyfx43ebXrxHVh5iGe3aqMjvaZIlPlmki4rok"
    private var fastlipaToken = "FastLipa_UvmFjyUMlDwGaoQjuZSPYF7l"
    private var sonicpesaApiKey = "Sk_live_oxASwwLQf9hbN4DwmNJSAJJ1aM1f1HrXZr0SRK6x"
    private var sonicpesaSecretKey = "OZFHiWXb86KPT3LF3G8PJA8jLJiAhzxBEG49W7dqXxqK4lDFJyKbMPP7URFBYx1S"
    private var snippeApiKey = "snp_86d85f87a04eb1bfba2c0396b5c6095432811a21c1b1960b47bfeea390577738"

    private var transactionId = ""
    private var currentOrderId = ""
    private var pollCount = 0
    private val handler = Handler(Looper.getMainLooper())
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (pollCount < 24) { // 24 times * 5s = 120 seconds / 2 minutes
                pollCount++
                val secondsRemaining = (24 - pollCount) * 5
                tvWaitingCountdown.text = "Tafadhali ingiza PIN kwenye simu yako ($secondsRemaining s)..."
                pollPaymentStatus()
                handler.postDelayed(this, 5000)
            } else {
                showFailureOverlay()
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_payment, container, false)

        db = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()

        rvPlans = view.findViewById(R.id.rv_plans)


        waitingOverlay = view.findViewById(R.id.container_waiting_overlay)
        successOverlay = view.findViewById(R.id.container_success_overlay)
        failureOverlay = view.findViewById(R.id.container_failure_overlay)
        tvWaitingCountdown = view.findViewById(R.id.tv_waiting_countdown)
        btnCancelWaiting = view.findViewById(R.id.btn_cancel_waiting)
        btnSuccessOk = view.findViewById(R.id.btn_success_ok)
        btnFailureRetry = view.findViewById(R.id.btn_failure_retry)

        setupRecyclerView()
        fetchPlans()
        fetchGatewaySettings()



        btnCancelWaiting.setOnClickListener {
            stopPolling()
            waitingOverlay.visibility = View.GONE
            Toast.makeText(context, "Muamala umeghairiwa", Toast.LENGTH_SHORT).show()
        }

        btnSuccessOk.setOnClickListener {
            successOverlay.visibility = View.GONE
            clearFields()
            (activity as? MainActivity)?.loadHomeFragment()
        }

        btnFailureRetry.setOnClickListener {
            failureOverlay.visibility = View.GONE
        }

        return view
    }

    private fun setupRecyclerView() {
        rvPlans.layoutManager = LinearLayoutManager(context)
        adapter = PlansAdapter(plansList) { plan ->
            selectedPlan = plan
            showPaymentDialog(plan)
        }
        rvPlans.adapter = adapter
    }

    private fun fetchPlans() {
        db.collection("plans")
            .get()
            .addOnSuccessListener { documents ->
                if (!isAdded || context == null) return@addOnSuccessListener
                plansList.clear()
                for (doc in documents) {
                    val active = doc.getBoolean("active") ?: true
                    if (active) {
                        val id = doc.id
                        val planKey = doc.getString("plan_key") ?: doc.getString("key") ?: id.lowercase()
                        val name = doc.getString("name") ?: doc.getString("title") ?: "Premium Package"
                        
                        val priceObj = doc.get("price") ?: doc.get("amount") ?: doc.get("cost") ?: "0"
                        val price = priceObj.toString()
                        
                        val daysObj = doc.get("days") ?: doc.get("duration_days") ?: doc.get("duration") ?: "30"
                        val days = daysObj.toString().toIntOrNull() ?: 30
                        
                        val sortOrderObj = doc.get("sort_order") ?: doc.get("order") ?: "0"
                        val sortOrder = sortOrderObj.toString().toIntOrNull() ?: 0

                        plansList.add(PlanItem(id, planKey, name, price, days, sortOrder))
                    }
                }
                plansList.sortBy { it.sortOrder }
                adapter.notifyDataSetChanged()
            }
            .addOnFailureListener { e ->
                if (!isAdded || context == null) return@addOnFailureListener
                Toast.makeText(context, "Imeshindikana kupakia vifurushi: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun fetchGatewaySettings() {
        db.collection("settings").document("general_settings")
            .get()
            .addOnSuccessListener { doc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                if (doc.exists()) {
                    val gw = doc.getString("active_gateway")
                    if (!gw.isNullOrBlank()) activeGateway = gw.trim().lowercase()
                    val pt = doc.getString("palmpesa_token")
                    if (!pt.isNullOrBlank()) palmpesaToken = pt.trim()
                    val ft = doc.getString("fastlipa_token")
                    if (!ft.isNullOrBlank()) fastlipaToken = ft.trim()
                    val sk = doc.getString("sonicpesa_api_key")
                    if (!sk.isNullOrBlank()) sonicpesaApiKey = sk.trim()
                    val ss = doc.getString("sonicpesa_secret_key")
                    if (!ss.isNullOrBlank()) sonicpesaSecretKey = ss.trim()
                    val sn = doc.getString("snippe_api_key")
                    if (!sn.isNullOrBlank()) snippeApiKey = sn.trim()
                }
            }
    }

    private fun showPaymentDialog(plan: PlanItem) {
        val ctx = context ?: return
        val dialogView = LayoutInflater.from(ctx).inflate(R.layout.dialog_payment, null)
        
        val tvTitle = dialogView.findViewById<TextView>(R.id.tv_dialog_title)
        val tvDesc = dialogView.findViewById<TextView>(R.id.tv_dialog_desc)
        val etPhone = dialogView.findViewById<TextInputEditText>(R.id.et_dialog_phone)
        val btnCancel = dialogView.findViewById<Button>(R.id.btn_dialog_cancel)
        val btnPay = dialogView.findViewById<Button>(R.id.btn_dialog_pay)

        tvTitle.text = "Lipia ${plan.name}"
        tvDesc.text = "Tafadhali weka namba yako ya simu hapa chini ili kufanya malipo ya TZS ${plan.price}"

        val dialog = com.google.android.material.dialog.MaterialAlertDialogBuilder(ctx)
            .setView(dialogView)
            .create()

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        btnCancel.setOnClickListener {
            dialog.dismiss()
        }

        btnPay.setOnClickListener {
            val phone = etPhone.text.toString().trim()
            if (phone.isEmpty()) {
                etPhone.error = "Tafadhali jaza namba ya simu"
                return@setOnClickListener
            }
            val phoneRegex = Regex("^0[67]\\d{8}$")
            if (!phoneRegex.matches(phone)) {
                etPhone.error = "Namba lazima ianze na 06 au 07, tarakimu 10"
                return@setOnClickListener
            }
            dialog.dismiss()
            val currentUser = auth.currentUser
            if (currentUser == null) {
                Toast.makeText(context, "Tafadhali ingia kwanza", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            initiateAutomatedPayment(currentUser.uid, currentUser.email ?: "", plan, phone)
        }

        dialog.show()
    }

    private fun submitPaymentRequestForDialog(plan: PlanItem, phone: String) {
        val currentUser = auth.currentUser ?: return
        initiateAutomatedPayment(currentUser.uid, currentUser.email ?: "", plan, phone)
    }

    private fun initiateAutomatedPayment(uid: String, email: String, plan: PlanItem, phone: String) {
        transactionId = "RT_${System.currentTimeMillis()}"

        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, plan.days)
        val expiresAt = calendar.time

        val subscriptionPayload = hashMapOf(
            "user_id" to uid,
            "user_email" to email,
            "plan_id" to plan.id,
            "plan" to plan.planKey,
            "plan_name" to plan.name,
            "price" to plan.price,
            "amount" to (plan.price.toIntOrNull() ?: 0),
            "gateway" to activeGateway.lowercase(),
            "phone" to phone,
            "transaction_id" to transactionId,
            "status" to "pending",
            "method" to "mobile_money_automated_$activeGateway",
            "expires_at" to com.google.firebase.Timestamp(expiresAt),
            "created_at" to FieldValue.serverTimestamp()
        )

        db.collection("subscriptions").document(transactionId)
            .set(subscriptionPayload)
            .addOnSuccessListener {
                if (!isAdded || context == null) return@addOnSuccessListener
                triggerUssdPush(uid, email, plan, phone)
            }
            .addOnFailureListener { e ->
                if (!isAdded || context == null) return@addOnFailureListener
                Toast.makeText(context, "Imeshindikana kuandaa malipo: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun triggerUssdPush(uid: String, email: String, plan: PlanItem, phone: String) {
        showWaitingOverlay()
        pollCount = 0
        tvWaitingCountdown.text = "Inatuma ombi la malipo kwenye simu yako..."

        db.collection("profiles").document(uid).get()
            .addOnSuccessListener { profileDoc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                val name = profileDoc.getString("display_name") ?: "Mtumiaji wa RevonTV"
                executePush(name, email, plan, phone)
            }
            .addOnFailureListener {
                if (!isAdded || context == null) return@addOnFailureListener
                executePush("Mtumiaji wa RevonTV", email, plan, phone)
            }
    }

    private fun executePush(name: String, email: String, plan: PlanItem, phone: String) {
        val client = OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
        val request: Request

        try {
            val cleanedPhone = phone.trim().replace("+", "").replace(" ", "")
            val intlPhone = if (cleanedPhone.startsWith("0")) "255" + cleanedPhone.substring(1) 
                            else if (!cleanedPhone.startsWith("255")) "255" + cleanedPhone 
                            else cleanedPhone

            val cleanPrice = plan.price.replace(",", "").replace("TZS", "").replace("KES", "").replace(" ", "").trim()
            var amountInt = cleanPrice.toIntOrNull() ?: 1000
            if (activeGateway.lowercase() == "snippe" && amountInt < 500) {
                amountInt = 500 // Snippe enforces minimum 500 TZS for mobile money
            }

            val nameParts = name.trim().split(" ").filter { it.isNotBlank() }
            val firstname = if (nameParts.isNotEmpty()) nameParts[0] else "RevonTech"
            val lastname = if (nameParts.size > 1) nameParts.drop(1).joinToString(" ") else "Mteja"
            val cleanEmail = if (email.isNotBlank()) email.trim() else "customer@revontv.com"

            when (activeGateway.lowercase()) {
                "palmpesa" -> {
                    val json = JSONObject().apply {
                        put("name", name)
                        put("email", cleanEmail)
                        put("phone", phone)
                        put("amount", amountInt)
                        put("transaction_id", transactionId)
                        put("address", "Dar es Salaam")
                        put("postcode", "11111")
                        put("callback_url", "https://revontv.com/api/callback")
                    }

                    val body = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
                    request = Request.Builder()
                        .url("https://palmpesa.drmlelwa.co.tz/api/palmpesa/initiate")
                        .post(body)
                        .addHeader("Authorization", "Bearer $palmpesaToken")
                        .build()
                }
                "fastlipa" -> {
                    val json = JSONObject().apply {
                        put("number", phone)
                        put("amount", amountInt)
                        put("name", name)
                    }

                    val body = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
                    request = Request.Builder()
                        .url("https://api.fastlipa.com/api/create-transaction")
                        .post(body)
                        .addHeader("Authorization", "Bearer $fastlipaToken")
                        .build()
                }
                "sonicpesa" -> {
                    val json = JSONObject().apply {
                        put("buyer_email", cleanEmail)
                        put("buyer_name", name)
                        put("buyer_phone", intlPhone)
                        put("amount", amountInt.toString())
                        put("currency", "TZS")
                    }

                    val body = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
                    request = Request.Builder()
                        .url("https://api.sonicpesa.com/api/v1/payment/create_order")
                        .post(body)
                        .addHeader("X-API-KEY", sonicpesaApiKey)
                        .addHeader("X-SECRET-KEY", sonicpesaSecretKey)
                        .build()
                }
                else -> { // Default to "snippe"
                    val detailsObj = JSONObject().apply {
                        put("amount", amountInt)
                        put("currency", "TZS")
                    }

                    val customerObj = JSONObject().apply {
                        put("firstname", firstname)
                        put("lastname", lastname)
                        put("email", cleanEmail)
                    }

                    val metadataObj = JSONObject().apply {
                        put("order_id", transactionId)
                    }

                    val json = JSONObject().apply {
                        put("payment_type", "mobile")
                        put("details", detailsObj)
                        put("phone_number", intlPhone)
                        put("customer", customerObj)
                        put("metadata", metadataObj)
                        put("webhook_url", "https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook")
                    }

                    val effectiveSnippeKey = if (snippeApiKey.isNotBlank()) snippeApiKey else "snp_86d85f87a04eb1bfba2c0396b5c6095432811a21c1b1960b47bfeea390577738"
                    val body = json.toString().toRequestBody("application/json".toMediaTypeOrNull())
                    request = Request.Builder()
                        .url("https://api.snippe.sh/v1/payments")
                        .post(body)
                        .addHeader("Authorization", "Bearer $effectiveSnippeKey")
                        .addHeader("Idempotency-Key", "RT_${System.currentTimeMillis()}_${(1000..9999).random()}")
                        .build()
                }
            }

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    android.util.Log.e("PaymentFragment", "executePush onFailure: ${e.message}")
                    val act = activity
                    if (act == null || !isAdded || getContext() == null) return
                    act.runOnUiThread {
                        if (!isAdded || getContext() == null) return@runOnUiThread
                        Toast.makeText(getContext(), "Hitilafu ya mtandao: ${e.message}", Toast.LENGTH_LONG).show()
                        showFailureOverlay()
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    val bodyString = response.body?.string()
                    val act = activity
                    if (act == null || !isAdded || getContext() == null) return
                    android.util.Log.d("PaymentFragment", "Initiate payment ($activeGateway) [${response.code}]: $bodyString")
                    
                    if (!response.isSuccessful || bodyString == null) {
                        var errorMsg = "Hitilafu ya lango la malipo [${response.code}]"
                        try {
                            if (bodyString != null) {
                                val errJson = JSONObject(bodyString)
                                val msg = errJson.optString("message", "")
                                if (msg.isNotEmpty()) {
                                    errorMsg = if (msg.contains("below minimum", ignoreCase = true)) {
                                        "Kiwango cha chini cha malipo ya Snippe ni TZS 500"
                                    } else {
                                        msg
                                    }
                                }
                            }
                        } catch (e: Exception) {}

                        act.runOnUiThread {
                            if (!isAdded || getContext() == null) return@runOnUiThread
                            Toast.makeText(getContext(), errorMsg, Toast.LENGTH_LONG).show()
                            showFailureOverlay()
                        }
                        return
                    }

                    try {
                        val jsonResponse = JSONObject(bodyString)
                        when (activeGateway.lowercase()) {
                            "snippe" -> {
                                val dataObj = jsonResponse.optJSONObject("data")
                                var ref = dataObj?.optString("reference", "") ?: ""
                                if (ref.isEmpty()) {
                                    ref = jsonResponse.optString("reference", "")
                                }
                                currentOrderId = ref
                            }
                                "palmpesa" -> {
                                    var pOrderId = jsonResponse.optString("order_id", "")
                                    val pDataObj = jsonResponse.optJSONObject("data")
                                    if (pOrderId.isEmpty() && pDataObj != null) {
                                        pOrderId = pDataObj.optString("order_id", "")
                                    }
                                    val pDataArr = jsonResponse.optJSONArray("data")
                                    if (pOrderId.isEmpty() && pDataArr != null && pDataArr.length() > 0) {
                                        val firstObj = pDataArr.optJSONObject(0)
                                        if (firstObj != null) {
                                            pOrderId = firstObj.optString("order_id", "")
                                        }
                                    }
                                    currentOrderId = pOrderId
                                }
                                "fastlipa" -> {
                                    var tranId = jsonResponse.optString("tranID", "")
                                    if (tranId.isEmpty()) tranId = jsonResponse.optString("tranid", "")
                                    val dataObj = jsonResponse.optJSONObject("data")
                                    if (dataObj != null) {
                                        if (tranId.isEmpty()) tranId = dataObj.optString("tranID", "")
                                        if (tranId.isEmpty()) tranId = dataObj.optString("tranid", "")
                                    }
                                    currentOrderId = tranId
                                }
                                "sonicpesa" -> {
                                    var sOrderId = jsonResponse.optString("order_id", "")
                                    val sDataObj = jsonResponse.optJSONObject("data")
                                    if (sOrderId.isEmpty() && sDataObj != null) {
                                        sOrderId = sDataObj.optString("order_id", "")
                                    }
                                    val sDataArr = jsonResponse.optJSONArray("data")
                                    if (sOrderId.isEmpty() && sDataArr != null && sDataArr.length() > 0) {
                                        val firstObj = sDataArr.optJSONObject(0)
                                        if (firstObj != null) {
                                            sOrderId = firstObj.optString("order_id", "")
                                        }
                                    }
                                    currentOrderId = sOrderId
                                }
                                else -> {
                                    val dataObj = jsonResponse.optJSONObject("data")
                                    var ref = dataObj?.optString("reference", "") ?: ""
                                    if (ref.isEmpty()) ref = jsonResponse.optString("reference", "")
                                    currentOrderId = ref
                                }
                            }
                    } catch (e: Exception) {
                        android.util.Log.e("PaymentFragment", "Error parsing init response: ${e.message}")
                    }

                    if (currentOrderId.isNotEmpty()) {
                        val updateField = when (activeGateway.lowercase()) {
                            "snippe" -> "snippe_reference"
                            "palmpesa" -> "palm_order_id"
                            "fastlipa" -> "fastlipa_tran_id"
                            "sonicpesa" -> "sonic_order_id"
                            else -> "snippe_reference"
                        }
                        val updates = hashMapOf<String, Any>(
                            updateField to currentOrderId,
                            "gateway" to activeGateway.lowercase()
                        )
                        db.collection("subscriptions").document(transactionId)
                            .update(updates)
                    }

                    act.runOnUiThread {
                        if (!isAdded || getContext() == null) return@runOnUiThread
                        // ALWAYS start polling so user gets the full 120s window to complete PIN entry
                        startPolling()
                    }
                }
            })
        } catch (e: Exception) {
            android.util.Log.e("PaymentFragment", "executePush error: ${e.message}")
            val act = activity
            if (act != null && isAdded && getContext() != null) {
                act.runOnUiThread {
                    startPolling()
                }
            }
        }
    }

    private fun pollPaymentStatus() {
        // 1. Check Firestore document first (Instant check for webhook auto-grant or admin approval)
        db.collection("subscriptions").document(transactionId).get()
            .addOnSuccessListener { doc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                if (doc.exists()) {
                    val status = doc.getString("status") ?: "pending"
                    if (status.equals("active", ignoreCase = true) || status.equals("completed", ignoreCase = true)) {
                        handlePaymentSuccess()
                        return@addOnSuccessListener
                    }
                }
            }

        if (currentOrderId.isEmpty()) return

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
        val request: Request

        when (activeGateway.lowercase()) {
            "snippe" -> {
                val effectiveSnippeKey = if (snippeApiKey.isNotBlank()) snippeApiKey else "snp_86d85f87a04eb1bfba2c0396b5c6095432811a21c1b1960b47bfeea390577738"
                request = Request.Builder()
                    .url("https://api.snippe.sh/v1/payments/$currentOrderId")
                    .get()
                    .addHeader("Authorization", "Bearer $effectiveSnippeKey")
                    .build()
            }
            "palmpesa" -> {
                val jsonBody = JSONObject().apply {
                    put("order_id", currentOrderId)
                    put("reference", transactionId)
                }
                val body = jsonBody.toString().toRequestBody("application/json".toMediaTypeOrNull())
                request = Request.Builder()
                    .url("https://palmpesa.drmlelwa.co.tz/api/order-status")
                    .post(body)
                    .addHeader("Authorization", "Bearer $palmpesaToken")
                    .build()
            }
            "fastlipa" -> {
                request = Request.Builder()
                    .url("https://api.fastlipa.com/api/status-transaction?tranid=$currentOrderId")
                    .get()
                    .addHeader("Authorization", "Bearer $fastlipaToken")
                    .build()
            }
            "sonicpesa" -> {
                val jsonBody = JSONObject().apply {
                    put("order_id", currentOrderId)
                }
                val body = jsonBody.toString().toRequestBody("application/json".toMediaTypeOrNull())
                request = Request.Builder()
                    .url("https://api.sonicpesa.com/api/v1/payment/order_status")
                    .post(body)
                    .addHeader("X-API-KEY", sonicpesaApiKey)
                    .addHeader("X-SECRET-KEY", sonicpesaSecretKey)
                    .build()
            }
            else -> {
                val effectiveSnippeKey = if (snippeApiKey.isNotBlank()) snippeApiKey else "snp_86d85f87a04eb1bfba2c0396b5c6095432811a21c1b1960b47bfeea390577738"
                request = Request.Builder()
                    .url("https://api.snippe.sh/v1/payments/$currentOrderId")
                    .get()
                    .addHeader("Authorization", "Bearer $effectiveSnippeKey")
                    .build()
            }
        }

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Ignore transient network errors during polling; keep waiting
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyString = response.body?.string()
                val act = activity
                if (act == null || !isAdded || getContext() == null) return
                android.util.Log.d("PaymentFragment", "Poll status ($activeGateway) [${response.code}]: $bodyString")
                if (response.isSuccessful && bodyString != null) {
                    try {
                        val json = JSONObject(bodyString)
                        var isPaid = false

                        when (activeGateway.lowercase()) {
                            "snippe" -> {
                                val dataObj = json.optJSONObject("data")
                                var payStatus = dataObj?.optString("status", "") ?: ""
                                if (payStatus.isEmpty()) {
                                    val rootStatus = json.optString("status", "")
                                    if (!rootStatus.equals("success", ignoreCase = true) && !rootStatus.equals("error", ignoreCase = true)) {
                                        payStatus = rootStatus
                                    }
                                }
                                if (payStatus.equals("completed", ignoreCase = true)) {
                                    isPaid = true
                                }
                                // CRITICAL: NEVER call showFailureOverlay() here!
                                // Allow the full 120 seconds for the user to complete their USSD PIN prompt!
                            }
                            "palmpesa" -> {
                                val dataObj = json.optJSONObject("data")
                                val dataArr = json.optJSONArray("data")
                                var payStatus = ""
                                if (dataArr != null && dataArr.length() > 0) {
                                    val firstObj = dataArr.optJSONObject(0)
                                    if (firstObj != null) {
                                        payStatus = firstObj.optString("payment_status", "")
                                        if (payStatus.isEmpty()) payStatus = firstObj.optString("status", "")
                                    }
                                } else if (dataObj != null) {
                                    payStatus = dataObj.optString("payment_status", "")
                                    if (payStatus.isEmpty()) payStatus = dataObj.optString("status", "")
                                }
                                if (payStatus.isEmpty()) {
                                    payStatus = json.optString("payment_status", "")
                                }
                                if (payStatus.isEmpty()) {
                                    val rootStatus = json.optString("status", "")
                                    if (!rootStatus.equals("success", ignoreCase = true) && !rootStatus.equals("fail", ignoreCase = true) && !rootStatus.equals("error", ignoreCase = true)) {
                                        payStatus = rootStatus
                                    }
                                }
                                if (payStatus.equals("Completed", ignoreCase = true) || payStatus.equals("success", ignoreCase = true)) {
                                    isPaid = true
                                }
                            }
                            "fastlipa" -> {
                                val dataObj = json.optJSONObject("data")
                                var payStatus = dataObj?.optString("payment_status", "") ?: ""
                                if (payStatus.isEmpty()) {
                                    payStatus = dataObj?.optString("status", "") ?: ""
                                }
                                if (payStatus.isEmpty()) {
                                    payStatus = json.optString("payment_status", "")
                                }
                                if (payStatus.equals("Completed", ignoreCase = true) || payStatus.equals("Success", ignoreCase = true)) {
                                    isPaid = true
                                }
                            }
                            "sonicpesa" -> {
                                var payStatus = json.optString("payment_status", "")
                                val dataObj = json.optJSONObject("data")
                                if (payStatus.isEmpty() && dataObj != null) {
                                    payStatus = dataObj.optString("payment_status", "")
                                }
                                val txObj = json.optJSONObject("transaction")
                                if (payStatus.isEmpty() && txObj != null) {
                                    payStatus = txObj.optString("payment_status", "")
                                }
                                if (payStatus.isEmpty() && dataObj != null) {
                                    payStatus = dataObj.optString("status", "")
                                }
                                if (payStatus.isEmpty() && txObj != null) {
                                    payStatus = txObj.optString("status", "")
                                }
                                if (payStatus.equals("success", ignoreCase = true)) {
                                    isPaid = true
                                }
                            }
                            else -> {
                                val dataObj = json.optJSONObject("data")
                                val payStatus = dataObj?.optString("status", "") ?: ""
                                if (payStatus.equals("completed", ignoreCase = true)) {
                                    isPaid = true
                                }
                            }
                        }

                        if (isPaid) {
                            act.runOnUiThread {
                                if (!isAdded || getContext() == null) return@runOnUiThread
                                handlePaymentSuccess()
                            }
                        }
                    } catch (e: Exception) {
                        // Fail silently during polling, keep waiting
                    }
                }
            }
        })
    }

    private fun handlePaymentSuccess() {
        stopPolling()
        val currentUser = auth.currentUser ?: return
        val plan = selectedPlan ?: return
        
        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, plan.days)
        val expiresAt = calendar.time

        db.collection("subscriptions").document(transactionId)
            .update("status", "active")
            .addOnSuccessListener {
                if (!isAdded || context == null) return@addOnSuccessListener
                val profileUpdate = hashMapOf<String, Any>(
                    "plan" to plan.planKey,
                    "is_active" to true,
                    "expires_at" to com.google.firebase.Timestamp(expiresAt)
                )
                db.collection("profiles").document(currentUser.uid)
                    .set(profileUpdate, SetOptions.merge())
                    .addOnSuccessListener {
                        if (!isAdded || context == null) return@addOnSuccessListener
                        showSuccessOverlay()
                    }
            }
    }

    private fun showWaitingOverlay() {
        waitingOverlay.visibility = View.VISIBLE
        successOverlay.visibility = View.GONE
        failureOverlay.visibility = View.GONE
    }

    private fun showSuccessOverlay() {
        stopPolling()
        waitingOverlay.visibility = View.GONE
        successOverlay.visibility = View.VISIBLE
        failureOverlay.visibility = View.GONE
    }

    private fun showFailureOverlay() {
        stopPolling()
        waitingOverlay.visibility = View.GONE
        successOverlay.visibility = View.GONE
        failureOverlay.visibility = View.VISIBLE
    }

    private fun startPolling() {
        pollCount = 0
        handler.removeCallbacks(pollRunnable)
        handler.post(pollRunnable)
    }

    private fun stopPolling() {
        handler.removeCallbacks(pollRunnable)
    }

    private fun clearFields() {
        selectedPlan = null
    }

    override fun onDestroyView() {
        super.onDestroyView()
        stopPolling()
    }

    private data class PlanItem(
        val id: String,
        val planKey: String,
        val name: String,
        val price: String,
        val days: Int,
        val sortOrder: Int
    )

    private class PlansAdapter(
        private val list: List<PlanItem>,
        private val onSelect: (PlanItem) -> Unit
    ) : RecyclerView.Adapter<PlansAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvName: TextView = view.findViewById(R.id.tv_plan_name)
            val tvDuration: TextView = view.findViewById(R.id.tv_plan_duration)
            val tvPrice: TextView = view.findViewById(R.id.tv_plan_price)
            val card: CardView = view as CardView
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_plan, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val plan = list[position]
            holder.tvName.text = plan.name
            holder.tvDuration.text = "Muda wa kifurushi: Siku ${plan.days}"
            holder.tvPrice.text = if (plan.price.contains("TZS") || plan.price.contains("KES")) plan.price else "TZS ${plan.price}"

            holder.card.setOnClickListener {
                onSelect(plan)
            }
        }

        override fun getItemCount() = list.size
    }
}
