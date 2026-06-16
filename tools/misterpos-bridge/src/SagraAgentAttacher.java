import com.sun.tools.attach.VirtualMachine;

public final class SagraAgentAttacher {
  private SagraAgentAttacher() {}

  public static void main(String[] args) throws Exception {
    if (args.length < 2) {
      System.err.println("Usage: SagraAgentAttacher <pid> <agent-jar> [agent-options]");
      System.exit(2);
    }

    String pid = args[0];
    String agentJar = args[1];
    String agentOptions = args.length >= 3 ? args[2] : "";

    VirtualMachine vm = VirtualMachine.attach(pid);
    try {
      vm.loadAgent(agentJar, agentOptions);
    } finally {
      vm.detach();
    }

    System.out.println("Attached " + agentJar + " to PID " + pid);
  }
}
