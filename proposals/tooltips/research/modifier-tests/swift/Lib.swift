public struct Mark {
  public var spec: [String: String]
  public init(_ s: [String: String]) { spec = s }
  public func name(_ n: String) -> Mark { var m = self; m.spec["name"] = n; return m }
}
