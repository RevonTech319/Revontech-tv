package com.revontech.tv

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.google.firebase.firestore.FirebaseFirestore

class AboutFragment : Fragment() {

    private lateinit var db: FirebaseFirestore

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_about, container, false)

        db = FirebaseFirestore.getInstance()

        fetchSettingsAndSetup(view)

        return view
    }

    private fun fetchSettingsAndSetup(view: View) {
        val btnWhatsapp = view.findViewById<View>(R.id.btn_about_whatsapp)
        val btnYoutube = view.findViewById<View>(R.id.btn_about_youtube)

        db.collection("settings")
            .limit(1)
            .get()
            .addOnSuccessListener { documents ->
                if (!documents.isEmpty) {
                    val doc = documents.documents[0]
                    val whatsappUrl = doc.getString("whatsapp_url") ?: ""
                    val youtubeUrl = doc.getString("youtube_url") ?: ""

                    if (whatsappUrl.isNotEmpty()) {
                        btnWhatsapp.visibility = View.VISIBLE
                        btnWhatsapp.setOnClickListener {
                            openUrl(whatsappUrl)
                        }
                    }

                    if (youtubeUrl.isNotEmpty()) {
                        btnYoutube.visibility = View.VISIBLE
                        btnYoutube.setOnClickListener {
                            openUrl(youtubeUrl)
                        }
                    }
                }
            }
            .addOnFailureListener { e ->
                // Even if firestore settings fetch fails, we continue silently
                android.util.Log.e("AboutFragment", "Failed to fetch settings: ${e.message}")
            }
    }

    private fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Imeshindikana kufungua anwani hii!", Toast.LENGTH_SHORT).show()
        }
    }
}
