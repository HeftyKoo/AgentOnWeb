import SafariServices

// The extension connects directly to the approved loopback runtime. It does not
// expose native messaging capabilities or log browser messages.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
