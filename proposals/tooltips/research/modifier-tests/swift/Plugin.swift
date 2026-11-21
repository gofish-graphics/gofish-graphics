import Lib
extension Mark {
  public func tooltip(_ f: String) -> Mark { var m = self; m.spec["tooltip"] = f; return m }
}
