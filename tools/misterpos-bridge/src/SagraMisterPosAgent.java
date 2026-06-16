import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.lang.instrument.Instrumentation;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.swing.SwingUtilities;
import misterpos.biz.TicketOne;

public final class SagraMisterPosAgent {
  private static final int DEFAULT_PORT = 8787;
  private static volatile boolean running;

  private SagraMisterPosAgent() {}

  public static void premain(String args, Instrumentation instrumentation) throws Exception {
    start(args);
  }

  public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
    start(args);
  }

  private static synchronized void start(String args) {
    if (running) {
      System.out.println("[sagra-agent] already running");
      return;
    }

    int port = parsePort(args);
    running = true;
    Thread thread = new Thread(() -> listen(port), "sagra-misterpos-agent-listener");
    thread.setDaemon(true);
    thread.start();
    System.out.println("[sagra-agent] listening on port " + port);
  }

  private static void listen(int port) {
    try (ServerSocket server = new ServerSocket(port)) {
      while (running) {
        Socket socket = server.accept();
        Thread worker = new Thread(() -> handle(socket), "sagra-misterpos-agent-request");
        worker.setDaemon(true);
        worker.start();
      }
    } catch (IOException error) {
      running = false;
      error.printStackTrace();
    }
  }

  private static void handle(Socket socket) {
    try (Socket closeable = socket) {
      Request request = Request.read(closeable.getInputStream());
      if ("OPTIONS".equals(request.method)) {
        respond(closeable.getOutputStream(), 204, "");
      } else if ("GET".equals(request.method) && "/health".equals(request.path)) {
        respond(closeable.getOutputStream(), 200, "{\"ok\":true}");
      } else if ("POST".equals(request.method) && "/load-order".equals(request.path)) {
        OrderRequest order = OrderRequest.parse(request.body);
        applyToDesktopCart(order);
        respond(closeable.getOutputStream(), 200, "{\"ok\":true,\"lines\":" + order.lines.size() + "}");
      } else {
        respond(closeable.getOutputStream(), 404, "{\"ok\":false,\"error\":\"not_found\"}");
      }
    } catch (Exception error) {
      error.printStackTrace();
      try {
        respond(socket.getOutputStream(), 400, "{\"ok\":false,\"error\":\"" + jsonEscape(error.getMessage()) + "\"}");
      } catch (IOException ignored) {
      }
    }
  }

  private static void applyToDesktopCart(OrderRequest request) throws Exception {
    final Exception[] thrown = new Exception[1];
    SwingUtilities.invokeAndWait(() -> {
      try {
        TicketOne ticket = TicketOne.singleton();
        ticket.reset();
        if (request.seatKey > 0) ticket.setTicketSeat(request.seatKey);
        for (Line line : request.lines) {
          if (line.quantity > 0) ticket.addItem2(line.quantity, line.articleKey, true, true);
        }
      } catch (Exception error) {
        thrown[0] = error;
      }
    });
    if (thrown[0] != null) throw thrown[0];
  }

  private static void respond(OutputStream output, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    PrintWriter writer = new PrintWriter(output, false, StandardCharsets.UTF_8);
    writer.print("HTTP/1.1 " + status + " " + reason(status) + "\r\n");
    writer.print("Access-Control-Allow-Origin: *\r\n");
    writer.print("Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n");
    writer.print("Access-Control-Allow-Headers: Content-Type\r\n");
    writer.print("Content-Type: application/json; charset=utf-8\r\n");
    writer.print("Content-Length: " + bytes.length + "\r\n");
    writer.print("Connection: close\r\n");
    writer.print("\r\n");
    writer.flush();
    output.write(bytes);
    output.flush();
  }

  private static String reason(int status) {
    if (status == 200) return "OK";
    if (status == 204) return "No Content";
    if (status == 400) return "Bad Request";
    if (status == 404) return "Not Found";
    return "Error";
  }

  private static int parsePort(String args) {
    if (args == null || args.trim().isEmpty()) return DEFAULT_PORT;
    Matcher matcher = Pattern.compile("(?:^|[,;\\s])port=(\\d+)(?:$|[,;\\s])").matcher(args);
    if (!matcher.find()) return DEFAULT_PORT;
    return Integer.parseInt(matcher.group(1));
  }

  private static String jsonEscape(String value) {
    if (value == null) return "";
    return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
  }

  private static final class Request {
    final String method;
    final String path;
    final String body;

    Request(String method, String path, String body) {
      this.method = method;
      this.path = path;
      this.body = body;
    }

    static Request read(InputStream input) throws IOException {
      BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
      String requestLine = reader.readLine();
      if (requestLine == null || requestLine.trim().isEmpty()) {
        throw new IOException("Empty request");
      }

      String[] parts = requestLine.split("\\s+");
      String method = parts.length > 0 ? parts[0] : "";
      String path = parts.length > 1 ? parts[1].split("\\?", 2)[0] : "";
      int contentLength = 0;

      String header;
      while ((header = reader.readLine()) != null && !header.isEmpty()) {
        int colon = header.indexOf(':');
        if (colon <= 0) continue;
        String name = header.substring(0, colon).trim();
        String value = header.substring(colon + 1).trim();
        if ("content-length".equalsIgnoreCase(name)) {
          contentLength = Integer.parseInt(value);
        }
      }

      char[] chars = new char[contentLength];
      int offset = 0;
      while (offset < contentLength) {
        int read = reader.read(chars, offset, contentLength - offset);
        if (read == -1) break;
        offset += read;
      }
      return new Request(method, path, new String(chars, 0, offset));
    }
  }

  private static final class OrderRequest {
    private static final Pattern SEAT_PATTERN = Pattern.compile("\"seatKey\"\\s*:\\s*(\\d+)");
    private static final Pattern LINE_PATTERN = Pattern.compile(
      "\\{[^{}]*\"articleKey\"\\s*:\\s*(\\d+)\\s*,\\s*\"quantity\"\\s*:\\s*(\\d+)[^{}]*\\}"
    );

    final int seatKey;
    final List<Line> lines;

    OrderRequest(int seatKey, List<Line> lines) {
      this.seatKey = seatKey;
      this.lines = lines;
    }

    static OrderRequest parse(String json) {
      Matcher seatMatcher = SEAT_PATTERN.matcher(json);
      int seatKey = seatMatcher.find() ? Integer.parseInt(seatMatcher.group(1)) : 0;

      List<Line> lines = new ArrayList<>();
      Matcher lineMatcher = LINE_PATTERN.matcher(json);
      while (lineMatcher.find()) {
        int articleKey = Integer.parseInt(lineMatcher.group(1));
        int quantity = Integer.parseInt(lineMatcher.group(2));
        lines.add(new Line(articleKey, quantity));
      }

      if (lines.isEmpty()) throw new IllegalArgumentException("No lines found in payload");
      return new OrderRequest(seatKey, lines);
    }
  }

  private static final class Line {
    final int articleKey;
    final int quantity;

    Line(int articleKey, int quantity) {
      this.articleKey = articleKey;
      this.quantity = quantity;
    }
  }
}
