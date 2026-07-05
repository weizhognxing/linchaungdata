package vip.kangqiao.picco

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.DocumentsContract
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraCaptureUri: Uri? = null
    private var pendingExportUrl: String? = null
    private var pendingExportFilename: String? = null
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uris = if (result.resultCode == Activity.RESULT_OK && cameraCaptureUri != null) {
            arrayOf(cameraCaptureUri!!)
        } else {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        }
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
        cameraCaptureUri = null
    }
    private val exportDirectoryLauncher = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        val exportUrl = pendingExportUrl
        val filename = pendingExportFilename
        pendingExportUrl = null
        pendingExportFilename = null

        if (uri == null) {
            notifyExportResult(false, "已取消导出")
            return@registerForActivityResult
        }
        if (exportUrl.isNullOrBlank() || filename.isNullOrBlank()) {
            notifyExportResult(false, "导出参数无效")
            return@registerForActivityResult
        }
        downloadExportToDirectory(exportUrl, filename, uri, webView.settings.userAgentString)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.loadsImagesAutomatically = true
        webView.addJavascriptInterface(AndroidExportBridge(), "AndroidExport")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = if (fileChooserParams?.isCaptureEnabled == true) {
                    createCameraIntent()
                } else {
                    fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "image/*"
                    }
                }

                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    this@MainActivity.cameraCaptureUri = null
                    Toast.makeText(this@MainActivity, "无法打开图片选择器", Toast.LENGTH_SHORT).show()
                    false
                }
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }
        }
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            downloadFile(url, userAgent, contentDisposition, mimeType)
        }

        webView.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun createCameraIntent(): Intent {
        val imageFile = File.createTempFile("picco_camera_", ".jpg", cacheDir)
        val imageUri = FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", imageFile)
        cameraCaptureUri = imageUri
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, imageUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
    }

    private fun downloadFile(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        try {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("User-Agent", userAgent ?: "")
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            Toast.makeText(this, "导出文件已开始下载", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "导出文件下载失败", Toast.LENGTH_SHORT).show()
        }
    }

    inner class AndroidExportBridge {
        @JavascriptInterface
        fun saveExportFile(url: String?, filename: String?) {
            runOnUiThread {
                pendingExportUrl = url
                pendingExportFilename = sanitizeFilename(filename)
                exportDirectoryLauncher.launch(null)
            }
        }
    }

    private fun downloadExportToDirectory(exportUrl: String, filename: String, directoryUri: Uri, userAgent: String) {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                val absoluteUrl = URL(URL(BuildConfig.WEB_URL), exportUrl).toString()
                connection = (URL(absoluteUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 30000
                    readTimeout = 300000
                    setRequestProperty("Cookie", CookieManager.getInstance().getCookie(absoluteUrl) ?: "")
                    setRequestProperty("User-Agent", userAgent)
                }

                connection.inputStream.use { input ->
                    val documentUri = createExportDocument(directoryUri, filename)
                        ?: throw IllegalStateException("无法在选择的目录创建文件")
                    contentResolver.openOutputStream(documentUri)?.use { output ->
                        input.copyTo(output)
                    } ?: throw IllegalStateException("无法写入导出文件")
                }
                notifyExportResult(true, "完整记录数据已导出到选择的目录")
            } catch (e: Exception) {
                notifyExportResult(false, e.message ?: "导出失败")
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun createExportDocument(directoryUri: Uri, filename: String): Uri? {
        val treeDocumentId = DocumentsContract.getTreeDocumentId(directoryUri)
        val parentDocumentUri = DocumentsContract.buildDocumentUriUsingTree(directoryUri, treeDocumentId)
        return DocumentsContract.createDocument(contentResolver, parentDocumentUri, "application/zip", filename)
    }

    private fun sanitizeFilename(filename: String?): String {
        val fallback = "case_export_${System.currentTimeMillis()}.zip"
        val clean = filename.orEmpty().replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        return clean.ifBlank { fallback }.let { if (it.endsWith(".zip", true)) it else "$it.zip" }
    }

    private fun notifyExportResult(success: Boolean, message: String) {
        runOnUiThread {
            val escapedMessage = message
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ")
                .replace("\r", " ")
            val script = "window.onAndroidExportResult && window.onAndroidExportResult($success, '$escapedMessage')"
            webView.evaluateJavascript(script, null)
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }
}
