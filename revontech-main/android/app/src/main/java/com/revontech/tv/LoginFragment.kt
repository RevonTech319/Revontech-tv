package com.revontech.tv

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class LoginFragment : Fragment() {

    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore

    private lateinit var tilName: TextInputLayout
    private lateinit var etName: TextInputEditText
    private lateinit var etPhone: TextInputEditText
    private lateinit var etPassword: TextInputEditText
    private lateinit var btnLogin: Button
    private lateinit var tvRegisterLink: TextView
    private lateinit var tvSubtitle: TextView

    private var isLoginMode = true

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_login, container, false)

        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()

        tilName = view.findViewById(R.id.til_name)
        etName = view.findViewById(R.id.et_name)
        etPhone = view.findViewById(R.id.et_phone)
        etPassword = view.findViewById(R.id.et_password)
        btnLogin = view.findViewById(R.id.btn_login)
        tvRegisterLink = view.findViewById(R.id.tv_register_link)
        tvSubtitle = view.findViewById(R.id.tv_subtitle)

        setupUI()

        return view
    }

    private fun setupUI() {
        updateMode()

        tvRegisterLink.setOnClickListener {
            isLoginMode = !isLoginMode
            updateMode()
        }

        btnLogin.setOnClickListener {
            val phone = etPhone.text.toString().trim()
            val password = etPassword.text.toString().trim()

            // Validate phone
            val digitsOnly = phone.replace(Regex("[^0-9]"), "")
            if (digitsOnly.length < 9) {
                Toast.makeText(context, "Namba ya simu lazima iwe na tarakimu 9 au zaidi", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Validate password
            if (password.isEmpty()) {
                Toast.makeText(context, "Tafadhali weka nenosiri", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!isLoginMode && password.length < 6) {
                Toast.makeText(context, "Nenosiri lazima liwe na herufi 6 au zaidi", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Convert phone to email (same logic as website)
            val email = phoneToEmail(phone)

            if (isLoginMode) {
                performLogin(email, password)
            } else {
                val name = etName.text.toString().trim()
                if (name.isEmpty()) {
                    Toast.makeText(context, "Tafadhali weka jina lako", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                performRegister(email, password, name, digitsOnly)
            }
        }
    }

    private fun updateMode() {
        if (isLoginMode) {
            tilName.visibility = View.GONE
            btnLogin.text = "INGIA SASA"
            tvRegisterLink.text = "Huna akaunti bado? Jisajili hapa"
            tvSubtitle.text = "Ingia kutazama vituo mubashara"
        } else {
            tilName.visibility = View.VISIBLE
            btnLogin.text = "JISAJILI SASA"
            tvRegisterLink.text = "Umeshajiandikisha? Ingia hapa"
            tvSubtitle.text = "Jisajili kutazama vituo mubashara"
        }
    }

    /**
     * Convert phone number to email using the EXACT same logic as the website:
     * 1. Strip all non-digit characters
     * 2. If starts with '0', replace leading '0' with '255'
     * 3. Prepend 'user' and append '@chtv.app'
     *
     * Example: "0712345678" → "user255712345678@chtv.app"
     */
    private fun phoneToEmail(phone: String): String {
        var digits = phone.replace(Regex("[^0-9]"), "")
        if (digits.startsWith("0")) {
            digits = "255" + digits.substring(1)
        }
        if (!digits.startsWith("255")) {
            digits = "255" + digits
        }
        return "user${digits}@chtv.app"
    }

    private fun performLogin(email: String, password: String) {
        btnLogin.isEnabled = false
        auth.signInWithEmailAndPassword(email, password)
            .addOnCompleteListener { task ->
                btnLogin.isEnabled = true
                if (task.isSuccessful) {
                    Toast.makeText(context, "Umeingia kwa mafanikio!", Toast.LENGTH_SHORT).show()
                    (activity as? MainActivity)?.checkAuthAndLoadView()
                } else {
                    Toast.makeText(context, "Kuingia kumeshindikana: " + task.exception?.message, Toast.LENGTH_LONG).show()
                }
            }
    }

    private fun performRegister(email: String, password: String, displayName: String, phone: String) {
        btnLogin.isEnabled = false
        auth.createUserWithEmailAndPassword(email, password)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val uid = auth.currentUser?.uid ?: ""
                    // Write profile to Firestore (same structure as website)
                    val profileData = hashMapOf(
                        "id" to uid,
                        "user_id" to uid,
                        "display_name" to displayName,
                        "avatar_url" to null,
                        "plan" to "Free",
                        "phone" to phone
                    )
                    firestore.collection("profiles").document(uid)
                        .set(profileData)
                        .addOnCompleteListener { profileTask ->
                            btnLogin.isEnabled = true
                            if (profileTask.isSuccessful) {
                                Toast.makeText(context, "Umejisajili kwa mafanikio!", Toast.LENGTH_SHORT).show()
                                (activity as? MainActivity)?.checkAuthAndLoadView()
                            } else {
                                // Auth succeeded but profile write failed - still navigate
                                Toast.makeText(context, "Umejisajili lakini profaili haikuandikwa", Toast.LENGTH_SHORT).show()
                                (activity as? MainActivity)?.checkAuthAndLoadView()
                            }
                        }
                } else {
                    btnLogin.isEnabled = true
                    Toast.makeText(context, "Usajili umeshindikana: " + task.exception?.message, Toast.LENGTH_LONG).show()
                }
            }
    }
}
