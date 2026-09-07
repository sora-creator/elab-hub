param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Reference,
  [Parameter(Mandatory=$true)][string]$ReferenceLabels,
  [Parameter(Mandatory=$true)][string]$Output
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;

public sealed class AnswerGridResult {
  public string Path { get; set; }
  public string Answers { get; set; }
  public double Confidence { get; set; }
  public int Lines { get; set; }
  public string Error { get; set; }
}

public static class ElabAnswerGrid {
  static List<int> Centers(bool[] flags) {
    var result = new List<int>();
    for (int i=0;i<flags.Length;i++) {
      if (!flags[i]) continue;
      int end=i; while(end+1<flags.Length && flags[end+1]) end++;
      result.Add((i+end)/2); i=end;
    }
    return result;
  }

  static List<int> RegularRun(List<int> lines) {
    var best = new List<int>();
    for(int first=0;first<lines.Count;first++) for(int second=first+1;second<lines.Count;second++) {
      int gap=lines[second]-lines[first]; if(gap<12) continue; if(gap>70) break;
      var run=new List<int>{lines[first],lines[second]};
      double tolerance=Math.Max(3,gap*.2); int from=second+1; double target=lines[second]+gap;
      while(from<lines.Count) {
        int found=-1; double distance=double.MaxValue;
        for(int k=from;k<lines.Count;k++) { double d=Math.Abs(lines[k]-target); if(d<distance){distance=d;found=k;} if(lines[k]>target+tolerance) break; }
        if(found<0||distance>tolerance) break;
        run.Add(lines[found]); from=found+1; target=lines[found]+gap;
      }
      if(run.Count>best.Count) best=run;
    }
    return best;
  }

  static bool Dark(Color c) { return c.R<165 && c.G<165 && c.B<165; }

  static List<bool[]> ExtractVectors(string path, out int lineCount) {
    using(var bitmap=new Bitmap(path)) {
      int[] rows=new int[bitmap.Height]; int rowMax=0;
      for(int y=0;y<bitmap.Height;y++){int n=0;for(int x=0;x<bitmap.Width;x+=2)if(Dark(bitmap.GetPixel(x,y)))n++;rows[y]=n;if(n>rowMax)rowMax=n;}
      double rowThreshold=Math.Max(bitmap.Width*.1,rowMax*.38);
      var horizontal=Centers(rows.Select(n=>n>rowThreshold).ToArray());
      var grid=RegularRun(horizontal); if(grid.Count>10) grid=grid.Skip(grid.Count-10).ToList(); lineCount=grid.Count;
      if(grid.Count<6) throw new Exception("horizontal:"+grid.Count+" candidates:"+horizontal.Count);
      int top=grid.First(),bottom=grid.Last(),height=bottom-top;
      int[] cols=new int[bitmap.Width]; int colMax=0;
      for(int x=0;x<bitmap.Width;x++){int n=0;for(int y=top;y<=bottom;y+=2)if(Dark(bitmap.GetPixel(x,y)))n++;cols[x]=n;if(n>colMax)colMax=n;}
      double colThreshold=Math.Max(height*.1,colMax*.4);
      var verticalCandidates=Centers(cols.Select(n=>n>colThreshold).ToArray());
      var vertical=RegularRun(verticalCandidates); if(vertical.Count>11) vertical=vertical.Skip(vertical.Count-11).ToList();
      if(vertical.Count<11) throw new Exception("vertical:"+vertical.Count+" candidates:"+verticalCandidates.Count);
      var vectors=new List<bool[]>();
      for(int row=0;row<grid.Count-1;row++) for(int col=1;col<vertical.Count-1;col+=2) {
        int x1=vertical[col],x2=vertical[col+1],y1=grid[row],y2=grid[row+1];
        double cx=(x1+x2)/2.0,cy=(y1+y2)/2.0,cw=x2-x1,ch=y2-y1;
        int sx=(int)Math.Round(cx-cw*.14),sy=(int)Math.Round(cy-ch*.25),sw=Math.Max(8,(int)Math.Round(cw*.28)),sh=Math.Max(10,(int)Math.Round(ch*.5));
        var points=new List<Point>();
        for(int y=0;y<sh;y++)for(int x=0;x<sw;x++){int px=Math.Max(0,Math.Min(bitmap.Width-1,sx+x)),py=Math.Max(0,Math.Min(bitmap.Height-1,sy+y));if(Dark(bitmap.GetPixel(px,py)))points.Add(new Point(x,y));}
        if(points.Count==0){vectors.Add(new bool[24*32]);continue;}
        int minX=points.Min(p=>p.X),maxX=points.Max(p=>p.X),minY=points.Min(p=>p.Y),maxY=points.Max(p=>p.Y);
        var vector=new bool[24*32];
        foreach(var p in points){int nx=3+(int)Math.Round((p.X-minX)*17.0/Math.Max(1,maxX-minX)),ny=3+(int)Math.Round((p.Y-minY)*25.0/Math.Max(1,maxY-minY));for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int xx=Math.Max(0,Math.Min(23,nx+dx)),yy=Math.Max(0,Math.Min(31,ny+dy));vector[yy*24+xx]=true;}}
        vectors.Add(vector);
      }
      if(vectors.Count<45) throw new Exception("cells:"+vectors.Count);
      return vectors.Take(45).ToList();
    }
  }

  static int Distance(bool[] a,bool[] b){int both=0,countA=0,countB=0;for(int i=0;i<a.Length;i++){if(a[i])countA++;if(b[i])countB++;if(a[i]&&b[i])both++;}if(countA+countB==0)return 1000;return (int)Math.Round(1000.0*(1.0-(2.0*both)/(countA+countB)));}

  public static AnswerGridResult Read(string path,string reference,string labels) {
    try {
      int refLines,lines; var refs=ExtractVectors(reference,out refLines); var target=ExtractVectors(path,out lines);
      var chars=new char[45]; double marginSum=0;
      for(int i=0;i<45;i++){
        var perDigit=new Dictionary<char,int>();
        for(int r=0;r<45;r++){char label=labels[r];int d=Distance(target[i],refs[r]);if(!perDigit.ContainsKey(label)||d<perDigit[label])perDigit[label]=d;}
        var ranked=perDigit.OrderBy(x=>x.Value).ToArray();chars[i]=ranked[0].Key;marginSum+=ranked[1].Value-ranked[0].Value;
      }
      return new AnswerGridResult{Path=path,Answers=new string(chars).Substring(17,28),Confidence=marginSum/45.0,Lines=lines};
    } catch(Exception ex) { return new AnswerGridResult{Path=path,Error=ex.Message}; }
  }
}
'@ -ReferencedAssemblies System.Drawing

$files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
  $_.Extension -match '^\.(png|jpg|jpeg|webp)$' -and $_.BaseName -match '정답|답지|해설'
} | Sort-Object FullName
$results = foreach ($file in $files) {
  [ElabAnswerGrid]::Read($file.FullName, $Reference, $ReferenceLabels)
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Output -Encoding UTF8
$results | Group-Object { if ($_.Error) { 'ERROR' } else { 'OK' } } | Select-Object Name,Count
