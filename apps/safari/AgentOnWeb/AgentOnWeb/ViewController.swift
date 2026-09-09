import Cocoa
import SafariServices
import WebKit

private let extensionBundleIdentifier = "dev.agentonweb.extension.safari"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        guard let page = Bundle.main.url(forResource: "Main", withExtension: "html"),
              let resources = Bundle.main.resourceURL else { return }
        webView.loadFileURL(page, allowingReadAccessTo: resources)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
            guard let state else { return }
            DispatchQueue.main.async { webView.evaluateJavaScript("show(\(state.isEnabled))") }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let action = message.body as? String else { return }
        let links = [
            "support": "https://heftykoo.github.io/AgentOnWeb/",
            "privacy": "https://heftykoo.github.io/AgentOnWeb/privacy.html"
        ]
        if let address = links[action], let url = URL(string: address) {
            NSWorkspace.shared.open(url)
        } else if action == "open-preferences" {
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
                if error != nil {
                    DispatchQueue.main.async {
                        self.webView.evaluateJavaScript("showError('Open Safari Settings, then choose Extensions and AgentOnWeb.')")
                    }
                }
            }
        }
    }
}
