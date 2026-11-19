import PDFKit
import AppKit
let a = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
let b = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[2]))!
for i in 0..<b.pageCount { a.insert(b.page(at: i)!, at: a.pageCount) }
a.write(to: URL(fileURLWithPath: CommandLine.arguments[3]))
print("pages", a.pageCount, "added", b.pageCount)
for i in (a.pageCount - b.pageCount)..<a.pageCount {
  let img = a.page(at: i)!.thumbnail(of: NSSize(width: 900, height: 1273), for: .mediaBox)
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(CommandLine.arguments[4])/p\(i+1).png"))
}
