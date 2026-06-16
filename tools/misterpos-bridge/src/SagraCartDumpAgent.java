import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.lang.instrument.Instrumentation;
import java.nio.charset.StandardCharsets;
import misterpos.biz.TicketOne;
import misterpos.dao.TicketItemBean;

public final class SagraCartDumpAgent {
  private SagraCartDumpAgent() {}

  public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
    String path = args == null || args.trim().isEmpty() ? "/tmp/misterpos-cart.json" : args.trim();
    TicketOne ticket = TicketOne.singleton();

    try (PrintWriter writer = new PrintWriter(
      new OutputStreamWriter(new FileOutputStream(path), StandardCharsets.UTF_8)
    )) {
      writer.print("{\"size\":");
      writer.print(ticket.size());
      writer.print(",\"total\":");
      writer.print(ticket.getTotal());
      writer.print(",\"items\":[");

      for (int i = 0; i < ticket.size(); i++) {
        TicketItemBean item = ticket.ticketItem(i);
        if (i > 0) writer.print(",");
        writer.print("{\"articleKey\":");
        writer.print(item.getItemArt());
        writer.print(",\"quantity\":");
        writer.print(item.getItem_qt());
        writer.print(",\"description\":\"");
        writer.print(escape(item.getItemArtDesc()));
        writer.print("\",\"price\":");
        writer.print(item.getsold_price());
        writer.print("}");
      }

      writer.print("]}");
    }

    System.out.println("[sagra-cart-dump] wrote " + path);
  }

  private static String escape(String value) {
    if (value == null) return "";
    return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
  }
}
