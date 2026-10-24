package com.revontech.tv

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import java.text.SimpleDateFormat
import java.util.*

class NotificationsFragment : Fragment() {

    private lateinit var db: FirebaseFirestore
    private lateinit var auth: FirebaseAuth
    private lateinit var rvNotifs: RecyclerView
    private lateinit var tvEmpty: TextView
    private lateinit var btnReadAll: Button
    private lateinit var btnDeleteAll: Button

    private val rawNotificationsList = mutableListOf<RawNotification>()
    private val mergedNotificationsList = mutableListOf<NotificationItem>()
    private lateinit var adapter: NotificationAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_notifications, container, false)

        db = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()

        rvNotifs = view.findViewById(R.id.rv_notifications)
        tvEmpty = view.findViewById(R.id.tv_empty_notifications)
        btnReadAll = view.findViewById(R.id.btn_read_all)
        btnDeleteAll = view.findViewById(R.id.btn_delete_all)

        setupRecyclerView()

        btnReadAll.setOnClickListener { markAllAsRead() }
        btnDeleteAll.setOnClickListener { deleteAllNotifications() }

        fetchNotifications()

        return view
    }

    private fun setupRecyclerView() {
        rvNotifs.layoutManager = LinearLayoutManager(context)
        adapter = NotificationAdapter(
            mergedNotificationsList,
            onDelete = { notifId -> deleteNotification(notifId) },
            onRead = { notifId -> markAsRead(notifId) }
        )
        rvNotifs.adapter = adapter
    }

    private fun fetchNotifications() {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Toast.makeText(context, "Mtumiaji hajaingia kwenye akaunti", Toast.LENGTH_SHORT).show()
            return
        }
        val uid = currentUser.uid

        db.collection("notifications")
            .orderBy("created_at", Query.Direction.DESCENDING)
            .get()
            .addOnSuccessListener { notifDocs ->
                rawNotificationsList.clear()
                for (doc in notifDocs) {
                    val id = doc.id
                    val title = doc.getString("title") ?: "Taarifa"
                    val message = doc.getString("message") ?: ""
                    val timestamp = doc.getTimestamp("created_at")
                    val date = timestamp?.toDate() ?: Date()
                    rawNotificationsList.add(RawNotification(id, title, message, date))
                }

                // Query user overrides
                db.collection("user_notifications")
                    .whereEqualTo("user_id", uid)
                    .get()
                    .addOnSuccessListener { overrideDocs ->
                        val readMap = mutableMapOf<String, Boolean>()
                        val deleteMap = mutableMapOf<String, Boolean>()

                        for (doc in overrideDocs) {
                            val notifId = doc.getString("notification_id") ?: ""
                            if (notifId.isNotEmpty()) {
                                readMap[notifId] = doc.getBoolean("is_read") ?: false
                                deleteMap[notifId] = doc.getBoolean("is_deleted") ?: false
                            }
                        }

                        mergeAndDisplay(readMap, deleteMap)
                    }
                    .addOnFailureListener {
                        // If overrides fail to load, proceed with empty maps
                        mergeAndDisplay(emptyMap(), emptyMap())
                    }
            }
            .addOnFailureListener { e ->
                Toast.makeText(context, "Imeshindikana kupakia taarifa: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun mergeAndDisplay(readMap: Map<String, Boolean>, deleteMap: Map<String, Boolean>) {
        mergedNotificationsList.clear()
        for (raw in rawNotificationsList) {
            val isDeleted = deleteMap[raw.id] ?: false
            if (!isDeleted) {
                val isRead = readMap[raw.id] ?: false
                mergedNotificationsList.add(
                    NotificationItem(
                        id = raw.id,
                        title = raw.title,
                        message = raw.message,
                        date = raw.date,
                        isRead = isRead
                    )
                )
            }
        }

        adapter.notifyDataSetChanged()

        if (mergedNotificationsList.isEmpty()) {
            tvEmpty.visibility = View.VISIBLE
            rvNotifs.visibility = View.GONE
        } else {
            tvEmpty.visibility = View.GONE
            rvNotifs.visibility = View.VISIBLE
        }
    }

    private fun markAllAsRead() {
        val currentUser = auth.currentUser ?: return
        val uid = currentUser.uid

        var count = 0
        for (item in mergedNotificationsList) {
            if (!item.isRead) {
                count++
                val docId = "${uid}_${item.id}"
                val data = hashMapOf(
                    "user_id" to uid,
                    "notification_id" to item.id,
                    "is_read" to true,
                    "is_deleted" to false
                )
                db.collection("user_notifications")
                    .document(docId)
                    .set(data)
            }
        }

        if (count > 0) {
            Toast.makeText(context, "Taarifa zote zimesomwa!", Toast.LENGTH_SHORT).show()
            fetchNotifications()
        } else {
            Toast.makeText(context, "Taarifa zote zimeshasomwa tayari", Toast.LENGTH_SHORT).show()
        }
    }

    private fun deleteAllNotifications() {
        val currentUser = auth.currentUser ?: return
        val uid = currentUser.uid

        var count = 0
        for (item in mergedNotificationsList) {
            count++
            val docId = "${uid}_${item.id}"
            val data = hashMapOf(
                "user_id" to uid,
                "notification_id" to item.id,
                "is_read" to true,
                "is_deleted" to true
            )
            db.collection("user_notifications")
                .document(docId)
                .set(data)
        }

        if (count > 0) {
            Toast.makeText(context, "Taarifa zote zimefutwa!", Toast.LENGTH_SHORT).show()
            fetchNotifications()
        } else {
            Toast.makeText(context, "Hakuna taarifa za kufuta", Toast.LENGTH_SHORT).show()
        }
    }

    private fun deleteNotification(notificationId: String) {
        val currentUser = auth.currentUser ?: return
        val uid = currentUser.uid

        val docId = "${uid}_${notificationId}"
        val data = hashMapOf(
            "user_id" to uid,
            "notification_id" to notificationId,
            "is_read" to true,
            "is_deleted" to true
        )
        db.collection("user_notifications")
            .document(docId)
            .set(data)
            .addOnSuccessListener {
                Toast.makeText(context, "Taarifa imefutwa!", Toast.LENGTH_SHORT).show()
                fetchNotifications()
            }
            .addOnFailureListener { e ->
                Toast.makeText(context, "Imeshindikana kufuta: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun markAsRead(notificationId: String) {
        val currentUser = auth.currentUser ?: return
        val uid = currentUser.uid

        val docId = "${uid}_${notificationId}"
        val data = hashMapOf(
            "user_id" to uid,
            "notification_id" to notificationId,
            "is_read" to true,
            "is_deleted" to false
        )
        db.collection("user_notifications")
            .document(docId)
            .set(data)
            .addOnSuccessListener {
                fetchNotifications()
            }
    }

    // Raw Notification Data Model
    private data class RawNotification(
        val id: String,
        val title: String,
        val message: String,
        val date: Date
    )

    // Notification Item Data Model
    private data class NotificationItem(
        val id: String,
        val title: String,
        val message: String,
        val date: Date,
        val isRead: Boolean
    )

    // RecyclerView Adapter
    private class NotificationAdapter(
        private val list: List<NotificationItem>,
        private val onDelete: (String) -> Unit,
        private val onRead: (String) -> Unit
    ) : RecyclerView.Adapter<NotificationAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvTitle: TextView = view.findViewById(R.id.tv_notif_title)
            val tvDesc: TextView = view.findViewById(R.id.tv_notif_desc)
            val tvTime: TextView = view.findViewById(R.id.tv_notif_time)
            val unreadIndicator: View = view.findViewById(R.id.view_unread_indicator)
            val btnDelete: ImageButton = view.findViewById(R.id.btn_delete_notif)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_notification, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val item = list[position]
            holder.tvTitle.text = item.title
            holder.tvDesc.text = item.message

            val sdf = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale("sw"))
            holder.tvTime.text = sdf.format(item.date)

            // Adjust styles based on whether it is read or unread
            if (item.isRead) {
                holder.unreadIndicator.visibility = View.GONE
                holder.tvTitle.setTypeface(null, android.graphics.Typeface.NORMAL)
            } else {
                holder.unreadIndicator.visibility = View.VISIBLE
                holder.tvTitle.setTypeface(null, android.graphics.Typeface.BOLD)
            }

            holder.btnDelete.setOnClickListener {
                onDelete(item.id)
            }

            holder.itemView.setOnClickListener {
                if (!item.isRead) {
                    onRead(item.id)
                }
            }
        }

        override fun getItemCount() = list.size
    }
}
