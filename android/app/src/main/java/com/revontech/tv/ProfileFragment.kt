package com.revontech.tv

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import com.bumptech.glide.Glide
import com.google.android.material.textfield.TextInputEditText
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*

class ProfileFragment : Fragment() {

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    private lateinit var tvDisplayName: TextView
    private lateinit var tvEmail: TextView
    private lateinit var tvSubStatus: TextView
    private lateinit var tvSubExpiry: TextView
    private lateinit var tvSubBadge: TextView
    private lateinit var rowDaysRemaining: View
    private lateinit var tvDaysRemaining: TextView
    private lateinit var etName: TextInputEditText
    private lateinit var etPhone: TextInputEditText
    private lateinit var imgAvatar: ImageView
    private lateinit var btnSave: Button
    private lateinit var btnLogout: Button
    private lateinit var btnSubscribe: Button

    private val selectImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            uploadAvatarToImgBB(uri)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_profile, container, false)

        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()

        tvDisplayName = view.findViewById(R.id.tv_profile_display_name)
        tvEmail = view.findViewById(R.id.tv_profile_email)
        tvSubStatus = view.findViewById(R.id.tv_sub_status)
        tvSubExpiry = view.findViewById(R.id.tv_sub_expiry)
        tvSubBadge = view.findViewById(R.id.tv_sub_badge)
        rowDaysRemaining = view.findViewById(R.id.row_days_remaining)
        tvDaysRemaining = view.findViewById(R.id.tv_days_remaining)
        etName = view.findViewById(R.id.et_profile_name)
        etPhone = view.findViewById(R.id.et_profile_phone)
        imgAvatar = view.findViewById(R.id.img_profile_avatar)
        btnSave = view.findViewById(R.id.btn_save_profile)
        btnSubscribe = view.findViewById(R.id.btn_profile_subscribe)
        btnLogout = view.findViewById(R.id.btn_profile_logout)
        val btnAbout = view.findViewById<Button>(R.id.btn_profile_about)

        val cardAvatar = view.findViewById<View>(R.id.card_avatar)
        val cardCamera = view.findViewById<View>(R.id.card_camera_overlay)

        val currentUser = auth.currentUser
        if (currentUser != null) {
            tvEmail.text = currentUser.email
            loadProfileDetails(currentUser.uid)
            checkSubscription(currentUser.uid)
        }

        val avatarClickListener = View.OnClickListener {
            selectImageLauncher.launch("image/*")
        }
        cardAvatar.setOnClickListener(avatarClickListener)
        cardCamera.setOnClickListener(avatarClickListener)

        btnSave.setOnClickListener {
            saveProfileDetails()
        }

        btnSubscribe.setOnClickListener {
            (activity as? MainActivity)?.loadPaymentFragment()
        }

        btnAbout.setOnClickListener {
            (activity as? MainActivity)?.loadAboutFragment()
        }

        btnLogout.setOnClickListener {
            auth.signOut()
            Toast.makeText(context, "Umetoka kwenye akaunti", Toast.LENGTH_SHORT).show()
            (activity as? MainActivity)?.checkAuthAndLoadView()
        }

        return view
    }

    private fun loadProfileDetails(userId: String) {
        db.collection("profiles").document(userId)
            .get()
            .addOnSuccessListener { doc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                if (doc.exists()) {
                    val name = doc.getString("display_name") ?: ""
                    val phone = doc.getString("phone") ?: ""
                    val avatarUrl = doc.getString("avatar_url") ?: ""

                    tvDisplayName.text = if (name.isNotEmpty()) name else "Mtumiaji wa RevonTV"
                    etName.setText(name)
                    etPhone.setText(phone)

                    if (avatarUrl.isNotEmpty()) {
                        Glide.with(this)
                            .load(avatarUrl)
                            .circleCrop()
                            .placeholder(android.R.drawable.ic_menu_myplaces)
                            .into(imgAvatar)
                    } else {
                        imgAvatar.setImageResource(android.R.drawable.ic_menu_myplaces)
                    }
                } else {
                    tvDisplayName.text = "Mtumiaji wa RevonTV"
                }
            }
            .addOnFailureListener { e ->
                if (!isAdded || context == null) return@addOnFailureListener
                Toast.makeText(context, "Imeshindikana kupakia taarifa za wasifu: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun saveProfileDetails() {
        val uid = auth.currentUser?.uid ?: return
        val name = etName.text.toString().trim()
        val phone = etPhone.text.toString().trim()

        if (name.isEmpty()) {
            Toast.makeText(context, "Tafadhali jaza jina lako", Toast.LENGTH_SHORT).show()
            return
        }
        val digitsOnly = phone.replace(Regex("[^0-9]"), "")
        if (digitsOnly.isEmpty()) {
            Toast.makeText(context, "Tafadhali jaza namba yako ya simu", Toast.LENGTH_SHORT).show()
            return
        }

        val data = hashMapOf<String, Any>(
            "display_name" to name,
            "phone" to digitsOnly
        )

        btnSave.isEnabled = false
        db.collection("profiles").document(uid)
            .set(data, SetOptions.merge())
            .addOnSuccessListener {
                if (!isAdded || context == null) return@addOnSuccessListener
                btnSave.isEnabled = true
                tvDisplayName.text = name
                Toast.makeText(context, "Taarifa zimehifadhiwa kikamilifu!", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener { e ->
                if (!isAdded || context == null) return@addOnFailureListener
                btnSave.isEnabled = true
                Toast.makeText(context, "Imeshindikana kuhifadhi: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun uploadAvatarToImgBB(uri: Uri) {
        try {
            val context = context ?: return
            val inputStream = context.contentResolver.openInputStream(uri)
            val bytes = inputStream?.readBytes()
            inputStream?.close()

            if (bytes == null) {
                Toast.makeText(context, "Imeshindikana kusoma faili ya picha", Toast.LENGTH_SHORT).show()
                return
            }

            Toast.makeText(context, "Picha inapakiwa...", Toast.LENGTH_SHORT).show()

            val client = OkHttpClient()
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "image", "avatar.jpg",
                    bytes.toRequestBody("image/jpeg".toMediaTypeOrNull(), 0, bytes.size)
                )
                .build()

            val request = Request.Builder()
                .url("https://api.imgbb.com/1/upload?key=5b388d098a546e1a9c8f9b160d9384a5")
                .post(requestBody)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    val act = activity
                    if (act == null || !isAdded || getContext() == null) return
                    act.runOnUiThread {
                        if (!isAdded || getContext() == null) return@runOnUiThread
                        Toast.makeText(getContext(), "Imeshindikana kupakia picha: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    val body = response.body?.string()
                    val act = activity
                    if (act == null || !isAdded || getContext() == null) return
                    if (response.isSuccessful && body != null) {
                        try {
                            val json = JSONObject(body)
                            val dataObj = json.getJSONObject("data")
                            val url = dataObj.getString("url")

                            // Update in Firestore
                            val uid = auth.currentUser?.uid
                            if (uid != null) {
                                db.collection("profiles").document(uid)
                                    .update("avatar_url", url)
                                    .addOnSuccessListener {
                                        if (!isAdded || getContext() == null) return@addOnSuccessListener
                                        val innerAct = activity
                                        innerAct?.runOnUiThread {
                                            if (!isAdded || getContext() == null) return@runOnUiThread
                                            Toast.makeText(getContext(), "Picha ya wasifu imesasishwa!", Toast.LENGTH_SHORT).show()
                                            Glide.with(this@ProfileFragment)
                                                .load(url)
                                                .circleCrop()
                                                .placeholder(android.R.drawable.ic_menu_myplaces)
                                                .into(imgAvatar)
                                        }
                                    }
                            }
                        } catch (e: Exception) {
                            act.runOnUiThread {
                                if (!isAdded || getContext() == null) return@runOnUiThread
                                Toast.makeText(getContext(), "Itifaki ya jibu ilishindwa: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        act.runOnUiThread {
                            if (!isAdded || getContext() == null) return@runOnUiThread
                            Toast.makeText(getContext(), "Imeshindikana kupakia picha kwenye seva", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            })
        } catch (e: Exception) {
            val ctx = context
            if (ctx != null) {
                Toast.makeText(ctx, "Hitilafu imetokea: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun checkSubscription(userId: String) {
        db.collection("subscriptions")
            .whereEqualTo("user_id", userId)
            .get()
            .addOnSuccessListener { documents ->
                if (!isAdded || context == null) return@addOnSuccessListener
                if (documents.isEmpty) {
                    tvSubStatus.text = "Huna Kifurushi"
                    tvSubExpiry.text = "Bado kupatikana"
                    tvSubBadge.text = "FREE"
                    tvSubBadge.setBackgroundResource(R.drawable.badge_bg_inactive)
                    rowDaysRemaining.visibility = View.GONE
                    return@addOnSuccessListener
                }

                var activeSubscriptionFound = false
                var latestExpiryDate: Date? = null
                var activePlanName = ""

                for (doc in documents) {
                    val status = doc.getString("status") ?: "pending"
                    val expiryDate = parseExpiresAt(doc)

                    if (status == "active") {
                        if (expiryDate == null || expiryDate.after(Date())) {
                            activeSubscriptionFound = true
                            
                            val planKey = doc.getString("plan") ?: doc.getString("plan_id") ?: ""
                            val rawPlanName = doc.getString("plan_name") ?: "Premium Package"
                            val currentPlanName = when (planKey.lowercase()) {
                                "day" -> "Siku 1"
                                "week" -> "Wiki 1"
                                "week2" -> "Wiki 2"
                                "month" -> "Mwezi 1"
                                else -> rawPlanName
                            }

                            if (expiryDate != null) {
                                if (latestExpiryDate == null || expiryDate.after(latestExpiryDate)) {
                                    latestExpiryDate = expiryDate
                                    activePlanName = currentPlanName
                                }
                            } else {
                                if (activePlanName.isEmpty()) {
                                    activePlanName = currentPlanName
                                }
                            }
                        }
                    }
                }

                if (activeSubscriptionFound) {
                    tvSubStatus.text = if (activePlanName.isNotEmpty()) activePlanName else "Premium Package"
                    tvSubBadge.text = "VIP ACTIVE"
                    tvSubBadge.setBackgroundResource(R.drawable.badge_bg_active)

                    if (latestExpiryDate != null) {
                        val sdf = SimpleDateFormat("dd MMMM yyyy HH:mm", Locale("sw"))
                        tvSubExpiry.text = sdf.format(latestExpiryDate)

                        // Days remaining calculation
                        val diff = latestExpiryDate.time - System.currentTimeMillis()
                        val daysLeft = Math.ceil(diff.toDouble() / (1000 * 60 * 60 * 24)).toInt()
                        if (daysLeft >= 0) {
                            rowDaysRemaining.visibility = View.VISIBLE
                            tvDaysRemaining.text = "$daysLeft ya siku"
                        } else {
                            rowDaysRemaining.visibility = View.GONE
                        }
                    } else {
                        tvSubExpiry.text = "Bila kikomo cha muda"
                        rowDaysRemaining.visibility = View.GONE
                    }
                } else {
                    tvSubStatus.text = "Bila Kifurushi"
                    tvSubExpiry.text = "Kimeisha muda au hakipo"
                    tvSubBadge.text = "EXPIRED"
                    tvSubBadge.setBackgroundResource(R.drawable.badge_bg_expired)
                    rowDaysRemaining.visibility = View.GONE
                }
            }
            .addOnFailureListener {
                if (!isAdded || context == null) return@addOnFailureListener
                tvSubStatus.text = "Imeshindikana Kupakia"
                tvSubExpiry.text = "Tafadhali angalia mtandao"
                tvSubBadge.text = "HITILAFU"
                tvSubBadge.setBackgroundResource(R.drawable.badge_bg_inactive)
                rowDaysRemaining.visibility = View.GONE
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
                    val sdf = SimpleDateFormat(format, Locale.US)
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
}
